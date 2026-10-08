// 分段翻译：将超长正文拆成 8K 字块，逐块翻译，拼接存入 translations 表
import { sql, closeDb } from "@aihot/backend/db";
import { chatJson } from "@aihot/backend/providers/llm";
import { sanitizeBody } from "@aihot/backend/content/sanitize";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const MAX_CHUNK = 8000;

/** Split text into chunks at paragraph boundaries, each ≤ MAX_CHUNK chars. */
function chunkText(text: string): string[] {
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let buf = "";

  for (const p of paragraphs) {
    if ((buf + "\n\n" + p).length > MAX_CHUNK && buf) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/** Translate a chunk via DeepSeek. */
async function translateChunk(chunk: string, index: number, total: number): Promise<string | null> {
  try {
    const res = await chatJson({
      model: await import("@aihot/backend/editorial/models").then(m => m.modelFor("translate")),
      purpose: "chunk_translate",
      subject: `chunk:${index}/${total}`,
      promptVersion: "chunk-v1",
      system: "你是专业的科技新闻译者。将用户给出的英文文本翻译成简体中文。保留段落结构，只翻译标签之间的文字。公司、产品与人名可保留英文原名；数字、单位照原文。直接输出翻译结果，不加解释。",
      user: chunk,
      temperature: 0.3,
      maxTokens: 16000,
      timeoutMs: 120_000,
    });
    // chatJson returns {content} or similar
    const text = typeof res === "string" ? res : (res as any)?.data?.content ?? (res as any)?.content ?? null;
    return text;
  } catch (e) {
    console.error(`  chunk ${index} error: ${String(e).slice(0, 60)}`);
    return null;
  }
}

// Find full+selected YouTube articles without translations
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
  console.log(`\n📖 ${a.title.slice(0, 50)} | ${a.body_text.length} 字`);

  // Remove the note prefix for translation
  const noteMatch = a.body_text.match(/^【[^】]+】\n\n/);
  const note = noteMatch ? noteMatch[0] : "";
  const cleanText = a.body_text.replace(/^【[^】]+】\n\n/, "");

  const chunks = chunkText(cleanText);
  console.log(`  分块: ${chunks.length} 块`);

  const translatedChunks: string[] = [];
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    console.log(`  翻译 ${i + 1}/${chunks.length} (${chunk.length} 字)...`);
    const translated = await translateChunk(chunk, i, chunks.length);
    if (translated) {
      translatedChunks.push(translated);
    } else {
      failed++;
      translatedChunks.push(chunk); // 保留原文作为 fallback
    }
    // Brief pause between chunks
    await new Promise(r => setTimeout(r, 1000));
  }

  const fullTranslation = (note ? note + "\n\n" : "") + translatedChunks.join("\n\n");
  const html = `<p>${fullTranslation.split("\n\n").map(p => p.replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("</p>\n<p>")}</p>`;

  // Store translation
  await sql`
    INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin)
    VALUES (${a.id}, 'zh', (SELECT revision FROM articles WHERE id = ${a.id}), ${a.title}, ${html}, ${fullTranslation}, ${failed === 0}, 'model')
    ON CONFLICT (article_id, lang) DO UPDATE SET
      revision = EXCLUDED.revision, title = EXCLUDED.title,
      body_html = EXCLUDED.body_html, body_text = EXCLUDED.body_text,
      complete = EXCLUDED.complete, origin = 'model', created_at = now()`;

  console.log(`  ✓ 完成: ${fullTranslation.length} 字${failed ? `（${failed} 块失败保留原文）` : "（全部翻译）"}`);
}

await stopBoss();
await closeDb();
