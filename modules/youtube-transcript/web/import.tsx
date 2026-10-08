import { useState } from "react";
import { Form, Link, useLoaderData, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { AdminContentChain, AdminContentSearch } from "@aihot/contracts/admin";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Button, Card, Field, Input, Select, Textarea } from "@aihot/web/features/admin/ui";

interface TranslationStatus { revision: number; translated_revision: number | null; complete: boolean | null; outcome: string | null; reason: string | null }

export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const q = params.get("q") ?? "";
  const content = id ? await adminGet<AdminContentChain>(request, `/api/admin/content/${encodeURIComponent(id)}`) : null;
  const search = q ? await adminGet<AdminContentSearch>(request, `/api/admin/content?q=${encodeURIComponent(q)}`) : null;
  const translation = id ? await adminGet<TranslationStatus>(request, `/api/admin/youtube-transcript/${encodeURIComponent(id)}/status`) : null;
  return { content, search, q, translation };
}

export default function ImportPage() {
  const { content, search, q, translation } = useLoaderData<typeof loader>();
  return <AdminPage title="YouTube 字幕转存" subtitle="选择站内视频，导入插件或 yt-dlp 导出的原文字幕，预览后保存。">
    <Form method="get" className="mb-5 flex max-w-2xl gap-2">
      <Input name="q" defaultValue={q} placeholder="站内视频的内容 ID、链接或标题" aria-label="查找视频" />
      <Button type="submit">查找</Button>
    </Form>
    {search && <ul className="mb-5 space-y-2">{search.rows.map(row => <li key={row.id}><Link className="text-accent" to={`?id=${row.id}`}>{row.title}</Link></li>)}{!search.rows.length && <li>没有找到内容，请先通过已有信源采集该视频。</li>}</ul>}
    {content && <Editor key={`${content.article.id}:${content.article.revision}`} content={content} translation={translation} />}
  </AdminPage>;
}

function Editor({ content: c, translation }: { content: AdminContentChain; translation: TranslationStatus | null }) {
  const revalidator = useRevalidator();
  const { run, busy } = useAdminAction();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState(c.article.language ?? "en");
  const [kind, setKind] = useState("unknown");
  const [reason, setReason] = useState("补充视频原文字幕");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ text: string; cues: number; paragraphs: number } | null>(null);
  const base = `/api/admin/youtube-transcript/${encodeURIComponent(c.article.id)}`;
  const input = { content: text, language, kind };
  const full = c.publication?.body_mode === "full" && c.publication.selected && c.publication.visibility === "public";
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card title={c.article.title}>
      <p className="mb-4 text-sm text-ink-3">第 {c.article.revision} 版 · <Link className="text-accent" to={`/admin/content/${c.article.id}`}>查看处理链路</Link></p>
      <div className="space-y-4">
        <Field label="字幕文件（最大 2 MB）">
          <input type="file" accept=".vtt,.srt,.json,.json3,.html,.htm,.md,.txt" disabled={busy} onChange={async e => {
            setPreview(null); setError(""); setText("");
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { setError("文件不能超过 2 MB"); return; }
            try { setText(await file.text()); } catch { setError("读取文件失败，请重新选择"); }
          }} />
        </Field>
        <Field label="或粘贴带时间戳的字幕">
          <Textarea rows={8} value={text} disabled={busy} onChange={e => { setText(e.target.value); setPreview(null); }} />
        </Field>
        <Field label="原文语言代码（如 en、ja、zh-CN）"><Input value={language} disabled={busy} onChange={e => { setLanguage(e.target.value); setPreview(null); }} /></Field>
        <Field label="字幕类型"><Select value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setPreview(null); }}>
          <option value="unknown">尚未核实</option><option value="auto">自动生成字幕</option><option value="manual">人工字幕</option>
        </Select></Field>
        <Field label="修改原因"><Input value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></Field>
        {error && <p role="alert" className="text-hot">{error}</p>}
        <Button disabled={busy || !text.trim()} onClick={async () => {
          setPreview(await run("POST", `${base}/preview`, input, { revalidate: false }));
        }}>预览字幕</Button>
      </div>
    </Card>
    <div className="space-y-5">
      <Card title="保存与翻译" right={<Button size="sm" disabled={busy} onClick={() => revalidator.revalidate()}>刷新状态</Button>}>
        <p role="status" className="mb-3 text-sm">译文：{translation?.translated_revision === c.article.revision ? translation.complete ? "当前版本已完整翻译" : "当前版本部分翻译，未完成的段落保留原文" : translation?.translated_revision ? "原文已更新，等待重新翻译" : "尚无译文"}</p>
        {translation?.reason && <p className="mb-3 text-sm text-ink-3">最近处理结果：{translation.reason}</p>}
        <p className="mb-3 text-sm text-ink-3">导入会替换原文正文并重新评估。入选精选且来源允许全文展示后，系统自动翻译。重复导入相同字幕不会新建修订。</p>
        <p className="mb-3 text-sm text-ink-3">站内全文：{c.article.site_fulltext ? "已允许" : "未允许"}。字幕导入不会改变全文权限或精选结果。</p>
        <Button disabled={busy || !full} onClick={() => run("POST", `${base}/translate`, {}, { success: "已加入翻译队列，完成后可在公开页切换中文 / 原文" })}>加入翻译队列</Button>
        {!full && <p className="mt-2 text-sm text-ink-4">完成评估并满足全文翻译条件后可手动加入队列。</p>}
      </Card>
      {preview && <Card title={`字幕预览 · ${preview.cues} 条 / ${preview.paragraphs} 段`}>
        <pre className="mb-4 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{preview.text}</pre>
        <Button tone="primary" disabled={busy || !reason.trim()} onClick={() => run("POST", base,
          { ...input, revision: c.article.revision, reason }, { success: "字幕已保存，处理进度见内容诊断" })}>保存字幕并重新评估</Button>
      </Card>}
    </div>
  </div>;
}
