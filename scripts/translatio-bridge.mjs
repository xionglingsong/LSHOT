// TRANSLATIO 邮件桥核心：从 stdin 读 agently-cli 的 JSON 输出，提取 TRANSLATIO 邮件，
// 读全文并推入 LSHOT ingest 接口。已有邮件自动跳过（服务端做 URL 去重）。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const TOKEN = env.match(/^INGEST_TOKEN=(.+)$/m)?.[1]?.trim();
const BASE = "http://127.0.0.1:3000";
const AGETLY = "/Users/lingsongxiong/.nvm/versions/node/v24.15.0/bin/agently-cli";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let list;
try { list = JSON.parse(raw); } catch { process.exit(0); }
const messages = list?.data?.data || list?.data || [];
const items = [];

for (const msg of messages) {
  const from = msg?.from?.email?.toLowerCase() ?? "";
  const subject = msg?.subject ?? "";
  // 只要 TRANSLATIO 列表发的（不是 LISTSERV 系统消息）
  if (!from.includes("jiscmail.ac.uk")) continue;
  if (subject.startsWith("Command confirmation") || subject.startsWith("Welcome") || subject.startsWith("Re: SUBSCRIBE")) continue;
  if (!subject.includes("TRANSLATIO") && !subject.includes("[")) continue;

  // 读全文
  try {
    const detail = JSON.parse(execFileSync(AGETLY, ["message", "+read", "--id", msg.message_id], { encoding: "utf8", timeout: 15000 }));
    const body = detail?.data?.body ?? "";
    if (!body || body.length < 50) continue;

    // HTML → 纯文本（去标签、压缩空白）
    const text = body
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // 构造 ingest 条目（URL 用 message_id 保证唯一）
    items.push({
      title: subject.replace(/^\[TRANSLATIO\]\s*/i, "").trim(),
      url: `https://www.jiscmail.ac.uk/cgi-bin/wa-jisc.exe?A2=TRANSLATIO;${msg.message_id}`,
      publishedAt: msg.created_at,
      author: msg?.from?.name ?? from,
      raw: { _aihot: { bodyText: text, bodyHtml: body } },
    });
  } catch (e) {
    console.error(`read ${msg.message_id}: ${e.message}`);
  }
}

if (!items.length) { console.log("no TRANSLATIO messages"); process.exit(0); }

// 推入 ingest
const res = await fetch(`${BASE}/api/ingest/items`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
  body: JSON.stringify({ sourceId: "ext-translatio-mail", sourceName: "TRANSLATIO 邮件列表（全文）", items }),
});
const out = await res.json();
console.log(`ingest: ${JSON.stringify(out)}`);
