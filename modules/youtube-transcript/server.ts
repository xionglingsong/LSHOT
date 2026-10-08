import { defineQueue, defineServerModule } from "@aihot/backend/modules";
import { sql } from "@aihot/backend/db";
import { enqueueOn } from "@aihot/backend/jobs/queue";
import { translateArticle } from "@aihot/backend/editorial/translate";
import { audit, Conflict } from "@aihot/backend/audit";
import { actorOf } from "@aihot/backend/admin/auth";
import { adminHandler } from "../../apps/api/src/routes/admin-auth.ts";
import { body, param } from "../../apps/api/src/routes/admin.ts";
import { importTranscript, previewTranscript } from "./backend/import.ts";

export const translationQueue = defineQueue<{ articleId: string }>({
  name: "youtube-transcript.translate", options: { policy: "singleton", retryLimit: 0, expireInSeconds: 3600 },
  worker: { localConcurrency: 1 },
  run: async jobs => { for (const job of jobs) await translateArticle(job.articleId); },
});

export default defineServerModule({
  name: "youtube-transcript", queues: [translationQueue],
  http(app) {
    const base = "/api/admin/youtube-transcript/:id";
    app.get(`${base}/status`, adminHandler(async req => {
      const [row] = await sql`SELECT a.revision, tr.revision AS translated_revision, tr.complete,
        t.outcome, t.reason FROM articles a
        LEFT JOIN translations tr ON tr.article_id=a.id AND tr.lang='zh'
        LEFT JOIN translation_attempts t ON t.article_id=a.id AND t.revision=a.revision
        WHERE a.id=${param(req, "id")}`;
      return row ?? null;
    }));
    app.post(`${base}/preview`, adminHandler(req => previewTranscript(param(req, "id"), body(req))));
    app.post(base, adminHandler((req, _reply, admin) => importTranscript(param(req, "id"), body(req), actorOf(admin))));
    app.post(`${base}/translate`, adminHandler(async (req, _reply, admin) => {
      const id = param(req, "id");
      const [p] = await sql`SELECT 1 FROM publications WHERE article_id=${id} AND selected AND visibility='public' AND body_mode='full'`;
      if (!p) throw new Conflict("需先完成评估、入选精选并获得全文展示许可，才能翻译正文");
      const jobId = await enqueueOn(translationQueue, { articleId: id }, { singletonKey: id });
      await audit(actorOf(admin), "content.queue-translation", `content:${id}`, "管理员请求正文翻译", null, { jobId });
      return { queued: true };
    }));
  },
});
