import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { installModules } from "@aihot/backend/modules";
import { config } from "@aihot/backend/config";
import { buildApp } from "../../../apps/api/src/app.ts";
import module from "../server.ts";
import { importTranscript } from "../backend/import.ts";

const source = `transcript-${tag()}`;
let id: string;
installModules([module]);
const app = await buildApp();
const input = { content: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nThis is a talk about interpreting and language services.", language: "en", kind: "auto", revision: 1, reason: "Import verified subtitles" };
before(async () => {
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,site_fulltext,syndicate_fulltext) VALUES (${source},'Transcript tests','rss','T1','editorial',false,false)`;
  id = (await upsertMaterial({ sourceId: source, url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Interpreting talk", excerpt: "Video description", via: "fetch", publishedAt: new Date() })).articleId;
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,category,title_zh,summary_zh,reason_zh,score,selected)
    VALUES (${id},1,'rule','pass','engine','口译讲座','摘要','理由',90,true)`;
  await publishArticle(id);
});
after(async () => { await app.close(); await stopBoss(); await closeDb(); installModules([]); });

test("admin and CSRF protect subtitle writes, invalid files get 400", async () => {
  const url = `/api/admin/youtube-transcript/${id}/preview`;
  assert.equal((await app.inject({ method: "POST", url, payload: input })).statusCode, 401);
  config.devAdmin = { displayName: "Test admin" };
  assert.equal((await app.inject({ method: "POST", url, payload: input })).statusCode, 403);
  const headers = { "x-csrf-token": "dev" };
  const preview = await app.inject({ method: "POST", url, headers, payload: input });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.equal(preview.json().paragraphs, 1);
  assert.equal((await sql`SELECT revision FROM articles WHERE id=${id}`)[0].revision, 1, "preview does not write");
  assert.equal((await app.inject({ method: "POST", url, headers, payload: { ...input, content: "not a subtitle" } })).statusCode, 400);
});

test("import records a revision, queues evaluation and leaves permissions and selection to the engine", async () => {
  const result = await importTranscript(id, input, "test-admin");
  assert.equal(result.revision, 2);
  const [a] = await sql`SELECT revision,body_html,language,body_status,processing_queued_at FROM articles WHERE id=${id}`;
  assert.equal(a.language, "en");
  assert.equal(a.body_status, "ok");
  assert.match(a.body_html, /t=1s/);
  assert.ok(a.processing_queued_at);
  assert.equal((await sql`SELECT 1 FROM article_revisions WHERE article_id=${id} AND revision=2`).length, 1);
  assert.equal((await sql`SELECT site_fulltext FROM sources WHERE id=${source}`)[0].site_fulltext, false);
  assert.equal((await sql`SELECT selected FROM publications WHERE article_id=${id}`)[0].selected, false);
  assert.equal((await sql`SELECT 1 FROM receipts WHERE subject LIKE ${`article:${id}%`}`).length, 0, "import buys no model calls");
  const again = await importTranscript(id, input, "test-admin");
  assert.equal(again.changed, false);
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE subject=${`content:${id}`} AND action='content.import-transcript'`).length, 1);
  await assert.rejects(importTranscript(id, { ...input, content: input.content.replace("This", "That") }, "test-admin"), /正文已更新/);
  assert.equal((await app.inject({ method: "POST", url: `/api/admin/youtube-transcript/${id}/translate`, headers: { "x-csrf-token": "dev" }, payload: {} })).statusCode, 409);
});
