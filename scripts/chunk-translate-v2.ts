// 分段翻译 V2：直接调 DeepSeek API，不走框架的 chatJson
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const API_KEY = envText.match(/^LLM_API_KEY=(.+)$/m)?.[1]?.trim();
const BASE_URL = envText.match(/^LLM_BASE_URL=(.+)$/m)?.[1]?.trim();
const MODEL = envText.match(/^LLM_MODEL=(.+)$/m)?.[1]?.trim();

if (!API_KEY || !BASE_URL || !MODEL) throw new Error("Missing LLM config");

const MAX_CHUNK = 6000;
const BATCH_CHARS = 3500; // characters per API call (multiple paragraphs)

/** Split text into chunks at paragraph boundaries. */
function chunkText(text: string, maxLen: number): string[] {
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/** Translate a chunk via DeepSeek (direct API). */
async function translateChunk(text: string, idx: number): Promise<string | null> {
  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: "你是专业的科技新闻译者。将用户给出的英文文本逐段翻译成简体中文。保留段落分隔（\\n\\n），公司名、产品名和人名保留英文，数字、单位照原文。直接输出翻译结果，不加任何解释或前缀。" },
      { role: "user", content: text },
    ],
    temperature: 0.3,
    max_tokens: Math.min(16000, Math.ceil(text.length * 1.5)),
  });

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.error(`  batch ${idx} HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    return content?.trim() ?? null;
  } catch (e) {
    console.error(`  batch ${idx}: ${String(e).slice(0, 50)}`);
    return null;
  }
}

// Find articles needing translation
const arts = await sql`
  SELECT ar.id, ar.title, ar.body_text
  FROM articles ar
  JOIN publications p ON p.article_id = ar.id
  JOIN sources s ON s.id = ar.source_id
  WHERE s.id LIKE 'yt-%' AND s.enabled = true
    AND p.body_mode = 'full' AND p.selected = true AND p.visibility = 'public'
    AND ar.body_status = 'ok' AND ar.language = 'en' AND length(ar.body_text) > 500
    AND ar.id NOT IN (SELECT article_id FROM translations WHERE lang = 'zh')
  ORDER BY length(ar.body_text) DESC`;

console.log(`待分段翻译: ${arts.length} 篇`);

for (const a of arts) {
  console.log(`\n📖 ${a.title.slice(0, 52)} | ${a.body_text.length} 字`);

  // Strip note prefix
  const noteMatch = a.body_text.match(/^【[^】]+】\n\n/);
  const note = noteMatch ? noteMatch[0] : "";
  const cleanText = a.body_text.replace(/^【[^】]+】\n\n/, "");

  // Split into translation batches (multiple paragraphs per call)
  const paragraphs = cleanText.split("\n\n");
  const batches: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > BATCH_CHARS && buf) {
      batches.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) batches.push(buf);

  console.log(`  分 ${batches.length} 批（每批 ≤ ${BATCH_CHARS} 字）`);

  const translatedParts: string[] = [];
  let failed = 0;

  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(`  ${i + 1}/${batches.length}...`);
    const t = await translateChunk(batches[i]!, i);
    if (t) {
      translatedParts.push(t);
      process.stdout.write(` ✓ (${t.length}字)\n`);
    } else {
      translatedParts.push(batches[i]!); // keep original as fallback
      failed++;
      process.stdout.write(` ✗ (保留原文)\n`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const fullTranslation = (note ? note + "\n\n" : "") + translatedParts.join("\n\n");
  const html = `<p>${fullTranslation.split("\n\n").map(p =>
    p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  ).join("</p>\n<p>")}</p>`;

  const [rev] = await sql`SELECT revision FROM articles WHERE id = ${a.id}`;

  await sql`
    INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin)
    VALUES (${a.id}, 'zh', ${rev.revision}, ${a.title}, ${html}, ${fullTranslation}, ${failed === 0}, 'model')
    ON CONFLICT (article_id, lang) DO UPDATE SET
      revision = EXCLUDED.revision, title = EXCLUDED.title,
      body_html = EXCLUDED.body_html, body_text = EXCLUDED.body_text,
      complete = EXCLUDED.complete, origin = 'model', created_at = now()`;

  console.log(`  📝 翻译完成: ${fullTranslation.length} 字${failed ? `（${failed} 批保留原文）` : "（全部翻译）"}`);
}

await stopBoss();
await closeDb();
