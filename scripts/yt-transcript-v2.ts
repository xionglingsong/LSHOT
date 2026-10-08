// YouTube 字幕转写 V2：按意群分段 + 全文翻译切换
// 改进：
//   1. 基于时间间隔检测段落边界（> 2 秒的停顿 = 新段落）
//   2. 基于句子完结检测段落边界（句号 + 时间停顿 = 确认分段）
//   3. 保留时间戳信息用于构建 HTML 版正文
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

const YT_DLP = "/Users/lingsongxiong/.local/bin/yt-dlp";
const TMP = "/tmp";

interface Cue { text: string; start: number; end: number }

/** Parse WebVTT into cues with time information. */
function parseVtt(vttPath: string): Cue[] {
  const raw = readFileSync(vttPath, "utf8");
  const lines = raw.split("\n");
  const cues: Cue[] = [];
  let i = 0;

  while (i < lines.length) {
    // Skip to timestamp line
    const tsMatch = lines[i]?.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (!tsMatch) { i++; continue; }

    const start = +tsMatch[1] * 3600 + +tsMatch[2] * 60 + +tsMatch[3] + +tsMatch[4] / 1000;
    const end = +tsMatch[5] * 3600 + +tsMatch[6] * 60 + +tsMatch[7] + +tsMatch[8] / 1000;

    // Collect text until next timestamp or blank
    const textLines: string[] = [];
    i++;
    while (i < lines.length) {
      const l = lines[i]!;
      if (/^\s*$/.test(l) || /^\d{2}:\d{2}:\d{2}/.test(l)) break;
      textLines.push(l);
      i++;
    }

    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .trim();

    if (text && !/^\[(Music|Applause|Laughter|Silence).*\]$/i.test(text)) {
      cues.push({ text, start, end });
    }
  }
  return cues;
}

/** Deduplicate overlapping cues (YouTube auto-subs repeat phrases). */
function dedupeCues(cues: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && (c.text === prev.text || prev.text.includes(c.text))) continue;
    if (prev && c.text.includes(prev.text)) { out[out.length - 1] = c; continue; }
    out.push(c);
  }
  return out;
}

/** Group cues into paragraphs by time gaps and sentence boundaries. */
function groupParagraphs(cues: Cue[]): { text: string; startTime: number }[] {
  const GAP_MS = 2000; // > 2 秒的停顿视为段落边界
  const MAX_SENTENCES = 6; // 每段最多 6 句

  const paragraphs: { text: string; startTime: number }[] = [];
  let current = { text: "", startTime: cues[0]?.start ?? 0 };
  let sentenceCount = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    current.text += (current.text ? " " : "") + cue.text;

    // Count sentence endings
    const sentences = cue.text.match(/[.!?]+/g);
    if (sentences) sentenceCount += sentences.length;

    const next = cues[i + 1];
    if (!next) {
      // Last cue
      if (current.text.trim()) paragraphs.push({ text: current.text.trim(), startTime: current.startTime });
      break;
    }

    const gap = next.start - cue.end;

    // Paragraph break conditions:
    // 1. Time gap > GAP_MS
    // 2. Current text ends with sentence-ending punctuation AND gap > 500ms
    // 3. Sentence count exceeds MAX_SENTENCES
    const endsWithSentence = /[.!?]["')\]]?\s*$/.test(current.text);
    const shouldBreak =
      gap > GAP_MS ||
      (endsWithSentence && gap > 500) ||
      (endsWithSentence && sentenceCount >= MAX_SENTENCES);

    if (shouldBreak) {
      if (current.text.trim()) {
        paragraphs.push({ text: current.text.trim(), startTime: current.startTime });
      }
      current = { text: "", startTime: next.start };
      sentenceCount = 0;
    }
  }

  return paragraphs;
}

/** Build clean text and HTML from paragraphs. */
function buildBody(paragraphs: { text: string; startTime: number }[]): { text: string; html: string } {
  const text = paragraphs.map(p => p.text).join("\n\n");
  const html = paragraphs.map(p => `<p>${p.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("\n");
  return { text, html };
}

/** Format seconds as [mm:ss] timestamp. */
function ts(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

/** Extract video ID from YouTube URL. */
function videoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

const NOTE = "【自动字幕转写 · 由 YouTube 自动语音识别生成，可能存在识别错误，专有名词或与原意有出入，仅供参考】";

async function processVideo(a: { id: string; url: string; title: string }) {
  const vid = videoId(a.url);
  if (!vid) return { ok: false, reason: "非 YouTube URL" };

  // Try en first, then en-GB
  let vttPath = "";
  for (const lang of ["en", "en-GB"]) {
    const p = `${TMP}/${vid}.${lang}.vtt`;
    try {
      execFileSync(YT_DLP, [
        "--write-auto-sub", "--sub-lang", lang, "--skip-download",
        "--output", `${TMP}/${vid}`, a.url,
      ], { timeout: 30000, stdio: ["ignore", "ignore", "ignore"] });
      if (existsSync(p)) { vttPath = p; break; }
    } catch { /* try next lang */ }
  }

  if (!vttPath) return { ok: false, reason: "无字幕" };

  const cues = dedupeCues(parseVtt(vttPath));
  const paragraphs = groupParagraphs(cues);
  const { text, html } = buildBody(paragraphs);
  unlinkSync(vttPath);

  if (text.length < 50) return { ok: false, reason: "字幕太短" };

  const fullText = `${NOTE}\n\n${text}`;
  const fullHtml = `<p><em>${NOTE}</em></p>\n${html}`;

  await sql`UPDATE articles SET body_text = ${fullText}, body_html = ${fullHtml}, body_status = 'ok', revision = revision + 1 WHERE id = ${a.id}`;
  return { ok: true, chars: text.length, paragraphs: paragraphs.length };
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

// 1) 开全文展示
await sql`UPDATE sources SET site_fulltext = true WHERE id LIKE 'yt-%' AND enabled = true`;
console.log("✓ YouTube 信源已开全文展示");

// 2) 找所有有正文的 YouTube 文章（重新分段 + 重新发布）
const arts = await sql`
  SELECT a.id, a.url, a.title, length(a.body_text) AS blen
  FROM articles a
  JOIN sources s ON s.id = a.source_id
  WHERE s.id LIKE 'yt-%' AND s.enabled = true AND a.body_status = 'ok' AND length(a.body_text) > 500
  LIMIT 20`;

console.log(`\n待重新分段: ${arts.length} 篇`);

for (const a of arts) {
  const result = await processVideo(a);
  if (result.ok) {
    console.log(`  ✓ ${a.title.slice(0, 45)} | ${result.chars} 字 / ${result.paragraphs} 段`);
  } else {
    console.log(`  ✗ ${a.title.slice(0, 40)} | ${result.reason}`);
  }
  await new Promise(r => setTimeout(r, 4000));
}

// 3) 强制精选 + 触发翻译
const selArts = await sql`
  SELECT DISTINCT a.id FROM articles a
  JOIN sources s ON s.id = a.source_id
  WHERE s.id LIKE 'yt-%' AND s.enabled = true AND a.body_status = 'ok' AND length(a.body_text) > 500`;

console.log(`\n精选+翻译: ${selArts.length} 篇`);

for (const a of selArts) {
  await sql`UPDATE analyses SET selected = true WHERE article_id = ${a.id} AND input_revision = (SELECT revision FROM articles WHERE id = ${a.id})`;
}

// Re-publish all
const { publishArticle } = await import("@aihot/backend/publication/publish");
const { translateArticle } = await import("@aihot/backend/editorial/translate");

for (const a of selArts) {
  const pub = await publishArticle(a.id);
  if (pub) {
    const tr = await translateArticle(a.id);
    console.log(`  ${tr.status} | ${a.id.slice(0, 12)}`);
  }
}

await stopBoss();
await closeDb();
