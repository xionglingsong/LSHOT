import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { translateArticle, translatePending } from "@aihot/backend/editorial/translate";
import { publishArticle } from "@aihot/backend/publication/publish";

const source = `long-translate-${tag()}`;
let empty = false;
let asks = 0;
let delayOnce = false;
const provider = await stub(async (_hit, req) => {
  const { segments } = JSON.parse(JSON.parse(req.body).messages[1].content) as { segments: string[] };
  asks++;
  if (delayOnce) { delayOnce = false; await new Promise(resolve => setTimeout(resolve, 2100)); }
  assert.ok(segments.join("").length <= 3500, "no oversized model request");
  return { choices: [{ message: { content: JSON.stringify({ t: segments.map(s => empty ? " " : s.replace(/English words/g, "中文译文").replace(/foreign talk/g, "外文演讲")) }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
before(async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,site_fulltext) VALUES (${source},'Long subtitles','rss','T1','editorial',true)`;
});
after(async () => { await provider.close(); await closeDb(); });
async function fixture(html: string, language: string | null = "en") {
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${tag()}`, title: "Long subtitles", bodyHtml: html, bodyText: html.replace(/<[^>]*>/g, ""), language, via: "import", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
    VALUES (${articleId},1,'rule','pass','engine','字幕测试','摘要','理由',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}
test("translates beyond 60k, splits legacy giant plain paragraphs and reuses paid receipts", async () => {
  const id = await fixture(`<p>${Array.from({ length: 5200 }, (_, i) => `English words ${i} `).join("")}</p><p>English words END</p>`);
  assert.equal((await translateArticle(id)).status, "translated");
  const [tr] = await sql`SELECT complete,body_html FROM translations WHERE article_id=${id}`;
  assert.equal(tr.complete, true);
  assert.match(tr.body_html, /END/);
  assert.ok(asks > 10);
  const previous = provider.hits();
  await translateArticle(id);
  assert.equal(provider.hits(), previous);
});
test("a Chinese notice does not suppress a foreign transcript and timestamp links survive", async () => {
  const id = await fixture('<p>【自动字幕转存，仅供参考】</p><p><a href="https://www.youtube.com/watch?v=abcdefghijk&amp;t=12s"><code>00:12</code></a> foreign talk '.concat('English words '.repeat(50), '</p>'), null);
  const result = await translateArticle(id);
  assert.equal(result.status, "translated");
  const [tr] = await sql`SELECT body_html FROM translations WHERE article_id=${id}`;
  assert.match(tr.body_html, /t=12s/);
  assert.match(tr.body_html, /<code>00:12<\/code>/);
  assert.match(tr.body_html, /外文演讲/);
  const zh = await fixture("<p>Chinese input 中文原文。</p>", "zh-CN");
  assert.equal((await translateArticle(zh)).status, "skipped");
});
test("empty answers never become a complete translation", async () => {
  const id = await fixture("<p>English words empty answer</p>");
  empty = true;
  assert.equal((await translateArticle(id)).status, "skipped");
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id=${id}`).length, 0);
  empty = false;
});

test("a run deadline stops between paid batches and resumes without a terminal attempt", async () => {
  const id = await fixture(`<p>${"English words budget-first ".repeat(100)}</p><p>${"English words budget-second ".repeat(100)}</p>`);
  delayOnce = true;
  const before = provider.hits();
  const paused = await translatePending({ limit: 1, budgetMs: 2000 });
  assert.deepEqual(paused.done, []);
  assert.equal(provider.hits() - before, 1);
  assert.equal((await sql`SELECT 1 FROM translation_attempts WHERE article_id=${id}`).length, 0);
  assert.equal((await sql`SELECT 1 FROM translations WHERE article_id=${id}`).length, 0);
  const resumed = await translatePending({ limit: 1 });
  assert.equal(resumed.done[0]?.status, "translated");
  assert.equal(provider.hits() - before, 2, "the first batch is reused, only the second is bought");
});
