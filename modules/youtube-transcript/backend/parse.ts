import * as cheerio from "cheerio";
import { sanitizeBody } from "@aihot/backend/content/sanitize";

class TranscriptError extends Error { statusCode = 400; }

export interface Cue { start: number; end?: number; text: string }
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 500_000;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (text: string) => cheerio.load(text, null, false).root().text().replace(/\s+/g, " ").trim();

export function youtubeId(input: string): string | null {
  try {
    const u = new URL(input);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : /^(www\.|m\.)?youtube\.com$/.test(u.hostname)
      ? u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(u.pathname)?.[1] : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function seconds(value: string): number {
  if (!/^(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?$/.test(value)) throw new TranscriptError("字幕时间戳格式无效");
  const parts = value.replace(",", ".").split(":").map(Number);
  if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1]! >= 60)) throw new TranscriptError("字幕时间戳超出范围");
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export function clock(start: number): string {
  const total = Math.floor(start);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Local exports only: VTT/SRT, YouTube JSON3 and the clipper's timestamped HTML/Markdown. */
export function parseTranscript(input: string): Cue[] {
  if (Buffer.byteLength(input) > MAX_FILE_BYTES) throw new TranscriptError("字幕文件不能超过 2 MB");
  const raw = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  let cues: Cue[] = [];
  if (/^[{[]/.test(raw) && !/^\[\d+:/.test(raw)) {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") throw new TranscriptError("JSON 字幕格式无效");
    if (Array.isArray(data.events)) {
      cues = data.events.filter((e: any) => e && Array.isArray(e.segs)).map((e: any) => ({
        start: typeof e.tStartMs === "number" ? e.tStartMs / 1000 : NaN,
        end: e.dDurationMs == null ? undefined : typeof e.dDurationMs === "number" ? (e.tStartMs + e.dDurationMs) / 1000 : NaN,
        text: e.segs.map((s: any) => s && typeof s.utf8 === "string" ? s.utf8 : "").join("").replace(/\s+/g, " ").trim(),
      }));
    } else {
      const rows = Array.isArray(data) ? data : data.segments;
      if (!Array.isArray(rows)) throw new TranscriptError("JSON 中没有字幕 events 或 segments");
      if (rows.some((r: unknown) => !r || typeof r !== "object")) throw new TranscriptError("JSON 字幕段落格式无效");
      cues = rows.map((r: any) => ({ start: typeof r.start === "number" ? r.start : seconds(String(r.time)), end: r.end,
        text: typeof r.text === "string" ? r.text.replace(/\s+/g, " ").trim() : "" }));
    }
  } else if (raw.includes("-->")) {
    for (const block of raw.split(/\n\s*\n/)) {
      if (/^(?:NOTE|STYLE|REGION)\b/.test(block)) continue;
      const lines = block.split("\n");
      const at = lines.findIndex(l => l.includes("-->"));
      if (at < 0) continue;
      const times = /^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[at]!);
      if (!times) throw new TranscriptError("字幕时间戳格式无效");
      cues.push({ start: seconds(times[1]!), end: seconds(times[2]!), text: clean(lines.slice(at + 1).join(" ")) });
    }
  } else if (/<(?:div|p|span)\b/i.test(raw)) {
    const $ = cheerio.load(raw);
    $(".transcript-segment").each((_, el) => {
      const stamp = $(el).find(".timestamp, [data-timestamp]").first();
      const value = stamp.attr("data-timestamp");
      const end = stamp.attr("data-end");
      const start = value == null ? seconds(stamp.text().trim()) : value.trim() ? Number(value) : NaN;
      stamp.remove();
      $(el).find("script, style").remove();
      cues.push({ start, end: end == null ? undefined : Number(end), text: $(el).text().replace(/^\s*[·•]\s*/, "").trim() });
    });
  } else {
    // Markdown exports may put the timestamp on a separate line or in a video link.
    for (const line of raw.split("\n")) {
      const m = /^\s*(?:[-*]\s+)?(?:\*\*)?\[?((?:\d+:)?\d{1,2}:\d{2})\]?(?:\([^)]*\))?(?:\*\*)?\s*(?:[·•-]\s*)?(.*)$/.exec(line);
      if (m) cues.push({ start: seconds(m[1]!), text: m[2]!.trim() });
      else if (cues.length && line.trim() && !/^#/.test(line)) cues.at(-1)!.text += ` ${line.trim()}`;
    }
  }
  cues = cues.filter(c => c.text.trim());
  if (!cues.length) throw new TranscriptError("未找到带时间戳的字幕；请选择 VTT、SRT、JSON3 或插件导出的 Transcript HTML/Markdown");
  if (cues.reduce((n, c) => n + c.text.length, 0) > MAX_TEXT) throw new TranscriptError("字幕文字不能超过 50 万字符");
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    if (!Number.isFinite(c.start) || c.start < 0 || (c.end !== undefined && (!Number.isFinite(c.end) || c.end < c.start)) || (i && c.start < cues[i - 1]!.start)) {
      throw new TranscriptError("字幕时间戳必须有效且按时间升序排列");
    }
  }
  return cues;
}

/** Rolling ASR windows repeat their tail; only overlapping cues are deduplicated. */
export function dedupeCues(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const prev = cues[i - 1];
    let text = cue.text;
    if (prev?.end !== undefined && cue.start <= prev.end) {
      if (prev.text === text) text = "";
      else {
        // Prefix table keeps large exported cues linear instead of trying every long suffix.
        const prefix = new Uint32Array(text.length);
        for (let at = 1, n = 0; at < text.length; at++) {
          while (n && text[at] !== text[n]) n = prefix[n - 1]!;
          if (text[at] === text[n]) n++;
          prefix[at] = n;
        }
        let n = 0;
        for (let at = 0; at < prev.text.length; at++) {
          const char = prev.text[at]!;
          while (n && (n === text.length || char !== text[n])) n = prefix[n - 1]!;
          if (char === text[n]) n++;
        }
        while (n && !((n === text.length || /\s|[\u3000-\u9fff]/.test(text[n]!)) &&
            (n === prev.text.length || /\s|[\u3000-\u9fff]/.test(prev.text[prev.text.length - n - 1]!)))) n = prefix[n - 1]!;
        text = text.slice(n).trim();
      }
    }
    if (text) out.push({ ...cue, text });
    else if (out.length) out.at(-1)!.end = Math.max(out.at(-1)!.end ?? 0, cue.end ?? cue.start);
  }
  return out;
}

export function groupCues(cues: Cue[]): Cue[] {
  const groups: Cue[] = [];
  for (const cue of dedupeCues(cues)) {
    // One exported cue can itself be a long paragraph. Bound it before model batching.
    const pieces: string[] = [];
    let remaining = cue.text;
    while (remaining) {
      let end = Math.min(1000, remaining.length);
      if (end < remaining.length) {
        const boundary = remaining.lastIndexOf(" ", end - 1);
        if (boundary > end / 2) end = boundary + 1;
        if (/[\uD800-\uDBFF]/.test(remaining[end - 1]!)) end--;
      }
      pieces.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    for (const piece of pieces) {
      const text = piece.trim();
      if (!text) continue;
      const last = groups.at(-1);
      const gap = last?.end === undefined ? 0 : cue.start - last.end;
      if (last && cue.start - last.start < 30 && gap <= 2 && last.text.length + text.length < 1200 &&
          !(/[.!?。！？]["”）)]?$/.test(last.text) && (gap > 0.5 || cue.start - last.start >= 12))) {
        last.text += /[\u3040-\u9fff]$/.test(last.text) && /^[\u3040-\u9fff]/.test(text) ? text : ` ${text}`;
        last.end = cue.end;
      } else groups.push({ ...cue, text });
    }
  }
  return groups;
}

export function transcriptBody(input: string, url: string, kind: "unknown" | "auto" | "manual") {
  const id = youtubeId(url);
  if (!id) throw new TranscriptError("这条内容不是有效的 YouTube 视频链接");
  const cues = parseTranscript(input);
  const paragraphs = groupCues(cues);
  const note = kind === "auto" ? "YouTube 自动字幕转存，可能存在识别错误。" : kind === "manual" ? "YouTube 人工字幕转存。" : "YouTube 字幕转存，字幕类型未经核实。";
  const html = sanitizeBody(`<p><em>${note}</em></p>\n` + paragraphs.map(p =>
    `<p><a href="https://www.youtube.com/watch?v=${id}&amp;t=${Math.floor(p.start)}s"><code>${clock(p.start)}</code></a> ${escape(p.text)}</p>`).join("\n"));
  const text = `${note}\n\n${paragraphs.map(p => `[${clock(p.start)}] ${p.text}`).join("\n\n")}`;
  return { html, text, cues: cues.length, paragraphs: paragraphs.length, duration: cues.at(-1)!.end ?? cues.at(-1)!.start };
}
