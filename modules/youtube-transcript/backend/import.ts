import { z } from "zod";
import { sql } from "@aihot/backend/db";
import { audit, Conflict } from "@aihot/backend/audit";
import { contentHash, reviseMaterial } from "@aihot/backend/content/materials";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { transcriptBody, MAX_FILE_BYTES } from "./parse.ts";

export const TranscriptInput = z.object({
  content: z.string().min(1).max(MAX_FILE_BYTES),
  language: z.string().trim().regex(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/, "请填写字幕原文的语言代码，如 en、ja、zh-CN"),
  kind: z.enum(["unknown", "auto", "manual"]),
});
const ImportInput = TranscriptInput.extend({ revision: z.number().int().positive(), reason: z.string().trim().min(1).max(500) });

export async function previewTranscript(id: string, input: unknown) {
  const data = TranscriptInput.parse(input);
  const [a] = await sql<{ url: string }[]>`SELECT url FROM articles WHERE id=${id}`;
  if (!a) throw new Conflict("内容不存在");
  return transcriptBody(data.content, a.url, data.kind);
}

export async function importTranscript(id: string, input: unknown, actor: string) {
  const data = ImportInput.parse(input);
  return sql.begin(async tx => {
    // Match the engine's row lock: another import/extraction may finish while a preview is open.
    const [a] = await tx<{ url: string; title: string; excerpt: string | null; body_html: string | null; language: string | null; revision: number }[]>`
      SELECT url,title,excerpt,body_html,language,revision FROM articles WHERE id=${id} FOR UPDATE`;
    if (!a) throw new Conflict("内容不存在");
    const body = transcriptBody(data.content, a.url, data.kind);
    if (a.body_html === body.html && a.language === data.language) return { articleId: id, revision: a.revision, changed: false };
    if (a.revision !== data.revision) throw new Conflict("正文已更新，请刷新后重新预览字幕");
    await reviseMaterial(tx, id, {
      set: tx`body_html=${body.html}, body_text=${body.text}, body_status='ok', language=${data.language}`,
      hash: contentHash({ title: a.title, excerpt: a.excerpt, bodyText: body.text }), title: a.title, bodyText: body.text,
    });
    await queueProcessing(id, { db: tx });
    await audit(actor, "content.import-transcript", `content:${id}`, data.reason, { revision: a.revision },
      { revision: a.revision + 1, language: data.language, kind: data.kind, cues: body.cues, paragraphs: body.paragraphs }, { db: tx });
    return { articleId: id, revision: a.revision + 1, changed: true };
  });
}
