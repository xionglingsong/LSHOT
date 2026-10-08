// Reddit 热帖批量导入：JSON API → 提取高分讨论 → ingest 推入 LSHOT
import { readFileSync } from "node:fs";
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const TOKEN = env.match(/^INGEST_TOKEN=(.+)$/m)?.[1]?.trim();
const BASE = "http://127.0.0.1:3000";

const SUBREDDITS = [
  { sub: "translationstudies", label: "翻译研究" },
  { sub: "MachineTranslation", label: "机器翻译" },
  { sub: "translator", label: "译员社区" },
  { sub: "interpretation", label: "口译" },
  { sub: "Localization", label: "本地化" },
];

interface RedditPost {
  data: {
    title: string; url: string; permalink: string; score: number;
    num_comments: number; created_utc: number; selftext?: string;
    author: string; link_flair_text?: string; over_18?: boolean;
  }
}

async function fetchTop(sub: string, timeframe: string, limit: number): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/top.json?t=${timeframe}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 LShotBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { children?: RedditPost[] } };
    return json.data?.children ?? [];
  } catch { return []; }
}

async function push(sourceId: string, sourceName: string, items: Array<{ title: string; url: string; publishedAt: string; body: string; score: number; comments: number }>) {
  if (!items.length) return 0;
  const res = await fetch(`${BASE}/api/ingest/items`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sourceId, sourceName, items }),
    signal: AbortSignal.timeout(30000),
  });
  const out = await res.json() as { ok: boolean; created?: number; error?: string };
  return out.created ?? 0;
}

let totalCreated = 0;

for (const { sub, label } of SUBREDDITS) {
  console.log(`\n📌 r/${sub} (${label})`);
  
  // Fetch top posts: this year (25) + this month (10)
  const [yearPosts, monthPosts] = await Promise.all([
    fetchTop(sub, "year", 25),
    fetchTop(sub, "month", 10),
  ]);

  // Merge and deduplicate
  const seen = new Set<string>();
  const all = [...yearPosts, ...monthPosts]
    .map(p => p.data)
    .filter(p => {
      if (!p.title || !p.permalink || p.over_18) return false;
      if (seen.has(p.permalink)) return false;
      seen.add(p.permalink);
      return true;
    })
    .sort((a, b) => b.score - a.score);

  console.log(`  获取: ${all.length} 帖（年榜 ${yearPosts.length} + 月榜 ${monthPosts.length}，去重后）`);

  // Build items
  const items = all.map(p => {
    const body = (p.selftext ?? "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .slice(0, 5000);
    const meta = `👍 ${p.score} | 💬 ${p.num_comments} | 作者 u/${p.author}`;
    return {
      title: p.title,
      url: `https://www.reddit.com${p.permalink}`,
      publishedAt: new Date(p.created_utc * 1000).toISOString(),
      body: `${meta}\n\n${body}`.trim(),
      score: p.score,
      comments: p.num_comments,
    };
  });

  // Push in batches of 25
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    const n = await push(`ext-reddit-hot-${sub}`, `r/${sub} 热门讨论`, batch);
    totalCreated += n;
    if (n > 0) console.log(`  +${n} 篇`);
  }

  // Show top 3
  items.slice(0, 3).forEach((it, i) => {
    console.log(`  ${i + 1}. [${it.score}👍 ${it.comments}💬] ${it.title.slice(0, 55)}`);
  });

  await new Promise(r => setTimeout(r, 3000));
}

console.log(`\n✅ 共导入: ${totalCreated} 帖热门讨论`);
await stopBoss();
await closeDb();
