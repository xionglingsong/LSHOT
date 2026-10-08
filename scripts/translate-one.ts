// 聚焦翻译一篇超长文章：分批 → 拼接 → 存入
import { readFileSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const KEY = env.match(/^LLM_API_KEY=(.+)$/m)?.[1]?.trim() ?? "";
const MODEL = env.match(/^LLM_MODEL=(.+)$/m)?.[1]?.trim() ?? "deepseek-v4-flash";
const API = "https://api.deepseek.com/v1";
const ARTICLE_ID = process.argv[2] ?? "e6ivt4g60i78l2ie4y9nt1xwx";
const BATCH = 3000;
const DELAY = 2000;

console.log(`翻译 ${ARTICLE_ID} | ${MODEL}`);

const [art] = await sql`SELECT id, title, body_text, revision FROM articles WHERE id = ${ARTICLE_ID}`;
if (!art) { console.log("文章不存在"); process.exit(1); }
console.log(`标题: ${art.title.slice(0, 50)} | ${art.body_text.length} 字`);

const noteMatch = art.body_text.match(/^【[^】]+】\n\n/);
const note = noteMatch?.[0] ?? "";
const text = art.body_text.replace(/^【[^】]+】\n\n/, "");

const paragraphs = text.split("\n\n");
const batches: string[] = [];
let buf = "";
for (const p of paragraphs) {
  if ((buf + "\n\n" + p).length > BATCH && buf) { batches.push(buf); buf = p; }
  else { buf = buf ? buf + "\n\n" + p : p; }
}
if (buf.trim()) batches.push(buf);
console.log(`分 ${batches.length} 批（每批 ≤ ${BATCH} 字）`);

const parts: string[] = [];
let ok = 0;
for (let i = 0; i < batches.length; i++) {
  const chunk = batches[i]!;
  process.stdout.write(`  ${i + 1}/${batches.length} (${chunk.length}字)...`);
  try {
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "你是专业的科技新闻译者。把英文文本逐段翻译成简体中文。保留段落分隔，公司名、产品名、人名保留英文，数字、单位照原文。直接输出译文。" },
          { role: "user", content: chunk },
        ],
        temperature: 0.3,
        max_tokens: Math.min(8000, Math.ceil(chunk.length * 1.2)),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      console.log(` HTTP ${res.status}`);
      parts.push(chunk);
      continue;
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const t = json.choices?.[0]?.message?.content?.trim();
    if (t && t.length > 20) {
      parts.push(t); ok++;
      console.log(` ✓ ${t.length}字`);
    } else {
      parts.push(chunk);
      console.log(` 空结果`);
    }
  } catch (e) {
    parts.push(chunk);
    console.log(` 超时`);
  }
  await new Promise(r => setTimeout(r, DELAY));
}

const full = (note ? note + "\n\n" : "") + parts.join("\n\n");
const html = `<p>${full.split("\n\n").map(p =>
  p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
).join("</p>\n<p>")}</p>`;

await sql`
  INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin)
  VALUES (${art.id}, 'zh', ${art.revision}, ${art.title}, ${html}, ${full}, ${ok === batches.length}, 'model')
  ON CONFLICT (article_id, lang) DO UPDATE SET
    revision = EXCLUDED.revision, title = EXCLUDED.title,
    body_html = EXCLUDED.body_html, body_text = EXCLUDED.body_text,
    complete = EXCLUDED.complete, origin = 'model', created_at = now()`;

console.log(`\n📝 完成: ${full.length} 字 | 成功 ${ok}/${batches.length} 批`);
await stopBoss();
await closeDb();
