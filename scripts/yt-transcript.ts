// YouTube 自动字幕转写 → 注入文章正文 → 重新入队分析
// 用法: node --env-file=.env scripts/yt-transcript.ts
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

const YT_DLP = "/Users/lingsongxiong/.local/bin/yt-dlp";
const TMP = "/tmp";

/** Parse WebVTT to clean text: strip timestamps, dedupe, remove tags. */
function vttToText(vttPath: string): string {
  const raw = readFileSync(vttPath, "utf8");
  const lines = raw.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];

  for (const line of lines) {
    const t = line
      .replace(/<[^>]+>/g, "")           // inline timing tags
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .trim();
    if (!t) continue;
    if (/^\d{2}:\d{2}/.test(t)) continue;  // timestamp lines
    if (/^WEBVTT|^Kind:|^Language:/i.test(t)) continue;
    if (/^\[(Music|Applause|Laughter|Silence|.*music.*)\]$/i.test(t)) continue;
    if (seen.has(t)) continue;             // dedupe consecutive repeats
    seen.add(t);
    out.push(t);
  }

  // Join into paragraphs: break at sentence boundaries every ~3-4 sentences
  const text = out.join(" ");
  const sentences = text.match(/[^.!?]+[.!?]+|\S+$/g) ?? [text];
  const paragraphs: string[] = [];
  let buf: string[] = [];
  for (const s of sentences) {
    buf.push(s.trim());
    if (buf.length >= 4) { paragraphs.push(buf.join(" ")); buf = []; }
  }
  if (buf.length) paragraphs.push(buf.join(" "));
  return paragraphs.join("\n\n").trim();
}

/** Extract video ID from YouTube URL. */
function videoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

// Find YouTube articles with missing or very short body text
const arts = await sql`
  SELECT a.id, a.url, a.title, length(a.body_text) AS blen, a.body_status
  FROM articles a
  JOIN sources s ON s.id = a.source_id
  WHERE s.id LIKE 'yt-%' AND s.enabled = true
    AND (a.body_status != 'ok' OR length(a.body_text) < 100)
  LIMIT 20`;

console.log(`待转写: ${arts.length} 篇`);

for (const a of arts) {
  const vid = videoId(a.url);
  if (!vid) { console.log(`  ✗ ${a.title.slice(0, 40)} | 非 YouTube URL`); continue; }

  const vttPath = `${TMP}/${vid}.en.vtt`;
  try {
    // Download auto-sub
    execFileSync(YT_DLP, [
      "--write-auto-sub", "--sub-lang", "en", "--skip-download",
      "--output", `${TMP}/${vid}`, a.url,
    ], { timeout: 30000, stdio: ["ignore", "ignore", "ignore"] });

    if (!existsSync(vttPath)) { console.log(`  ✗ ${a.title.slice(0, 40)} | 无字幕`); continue; }

    const text = vttToText(vttPath);
    unlinkSync(vttPath);

    if (text.length < 50) { console.log(`  ✗ ${a.title.slice(0, 40)} | 字幕太短`); continue; }

    // Inject body
    const withNote = `【自动字幕转写 · 由 YouTube 自动语音识别生成，可能存在识别错误，专有名词或与原意有出入，仅供参考】

${text}`;
    await sql`UPDATE articles SET body_text = ${withNote}, body_status = 'ok' WHERE id = ${a.id}`;
    await sql`UPDATE articles SET revision = revision + 1 WHERE id = ${a.id}`;
    await queueProcessing(a.id, { attemptTag: "yt-transcript" });
    console.log(`  ✓ ${a.title.slice(0, 45)} | ${text.length} 字`);

  } catch (e) {
    console.log(`  ✗ ${a.title.slice(0, 40)} | ${String(e).slice(0, 50)}`);
    if (existsSync(vttPath)) unlinkSync(vttPath);
  }
  await new Promise(r => setTimeout(r, 4000)); // 避 429 限频
}

await stopBoss();
await closeDb();
