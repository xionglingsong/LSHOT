// 论文 APA 引用后处理：从数据库字段构造引用，追加到 summary_zh 末尾
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";

// 找所有论文类文章
const papers = await sql`
  SELECT DISTINCT a.id, a.title AS orig, a.url, a.published_at
  FROM articles a
  JOIN analyses an ON an.article_id = a.id AND an.input_revision = a.revision
  WHERE an.output->>'itemType' = 'research_paper' AND an.selected = true`;

console.log(`论文: ${papers.length} 篇`);

for (const p of papers) {
  // 构造 APA 引用
  const year = p.published_at?.getFullYear() ?? new Date().getFullYear();
  const url = p.url;
  
  // 尝试从 body_text 提取作者（通常在论文描述的开头）
  const [art] = await sql`SELECT body_text FROM articles WHERE id = ${p.id}`;
  const body = art?.body_text ?? "";
  
  // 提取作者：找 "Author, A., & Author, B." 模式或常见格式
  let authors = "";
  const authorMatch = body.match(/(?:Author[s]?|By)[:\s]+([A-Z][a-z]+[^,\n]{0,30}(?:,\s*&?\s*[A-Z][a-z]+[^,\n]{0,30}){0,3})/i);
  if (authorMatch) authors = authorMatch[1]?.trim() ?? "";
  
  // 如果没提取到，尝试找 "XXX, Y., & ZZZ, W." 格式
  if (!authors) {
    const apaAuthors = body.match(/([A-Z][a-zà-ÿ]+,\s*[A-Z]\.[^.\n]{0,20}(?:,\s*&\s*[A-Z][a-zà-ÿ]+,\s*[A-Z]\.)?)/);
    if (apaAuthors) authors = apaAuthors[1]?.trim() ?? "";
  }
  
  // 构造引用（作者, 年份, 原题, URL）
  const authorPart = authors ? `${authors} ` : "";
  const citation = `${authorPart}(${year}). ${p.orig}. ${url}`;
  
  // 检查是否已有引用（避免重复追加）
  const [an] = await sql`
    SELECT summary_zh FROM analyses 
    WHERE article_id = ${p.id} AND input_revision = (SELECT revision FROM articles WHERE id = ${p.id})`;
  const current = an?.summary_zh ?? "";
  
  if (current.includes("――――――")) {
    console.log(`  = ${p.orig.slice(0, 40)} (已有引用)`);
    continue;
  }
  
  // 追加引用
  const newSummary = `${current}\n\n――――――\nAPA Citation: ${citation}`;
  
  await sql`
    UPDATE analyses SET summary_zh = ${newSummary}
    WHERE article_id = ${p.id} AND input_revision = (SELECT revision FROM articles WHERE id = ${p.id})`;
  
  // 同步更新 publications 表
  await sql`
    UPDATE publications SET summary = ${newSummary}
    WHERE article_id = ${p.id}`;
  
  console.log(`  ✓ ${p.orig.slice(0, 45)} → 已追加引用`);
}

await stopBoss();
await closeDb();
