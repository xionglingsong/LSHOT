// Paper citation metadata from CrossRef (api.crossref.org), fetched by DOI and cached in
// paper_metadata. Free, keyed by nothing, polite-pool via a mailto header. The APA citation builder
// (publication/items.ts) prefers these fields over the byline/URL heuristics: a journal name with
// volume, issue and pages is a reference a scholar can use, a bare link is not.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { guardedFetch } from "../lib/http-fetch.ts";
import { sql } from "../db.ts";

const run = promisify(execFile);

/** The DOI in a URL, query and fragment stripped ("…/doi/abs/10.1177/x?af=R" → "10.1177/x"). */
export function doiOf(url: string): string | null {
  return /^(?:https?:\/\/)?(?:dx\.)?doi\.org\/(10\.[^\s?#]+)$/i.exec(url.trim())?.[1]
    ?? /10\.\d{4,9}\/[^\s?#"'<>]+/i.exec(url)?.[0] ?? null;
}

interface CrossRefWork {
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  issued?: { "date-parts"?: Array<Array<number | undefined>> };
  title?: string[];
  type?: string;
}

/** CrossRef strings carry JATS inline markup ("<i>…</i>") and hard wraps: flatten to plain text. */
function plainJats(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** The journal's short name: the last container title CrossRef lists ("Terminology", not its subtitle). */
function venueOf(work: CrossRefWork): string | null {
  const list = work["container-title"]?.map((t) => plainJats(t)).filter(Boolean) ?? [];
  return list.at(-1) ?? null;
}

function yearOf(work: CrossRefWork): number | null {
  const parts = work.issued?.["date-parts"]?.[0];
  const year = parts?.[0];
  return typeof year === "number" && year > 1900 && year < 2200 ? year : null;
}

/** "Song Liu + Weiwei Wang" as APA authors: "Liu, S., & Wang, W." */
function apaAuthorsOf(work: CrossRefWork): string | null {
  const list = (work.author ?? []).map((a) => {
    if (a.name?.trim()) return a.name.trim(); // an institutional author CrossRef already names
    const family = a.family?.trim(), given = a.given?.trim();
    if (!family) return given ?? null;
    const initials = given ? given.split(/\s+/).filter(Boolean).map((g) => `${g[0]!.toUpperCase()}.`).join(" ") : "";
    return initials ? `${family}, ${initials}` : family;
  }).filter((x): x is string => !!x);
  if (!list.length) return null;
  return list.length > 1 ? `${list.slice(0, -1).join(", ")}, & ${list.at(-1)}` : list[0]!;
}

export interface PaperMetadata {
  doi: string;
  authors: string | null;
  year: number | null;
  title: string | null;
  venue: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
}

/** Asks CrossRef for one work. Null on any failure: the citation falls back to what it has. */
export async function fetchCrossRef(doi: string): Promise<PaperMetadata | null> {
  let work: CrossRefWork;
  try {
    const res = await guardedFetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      timeoutMs: 15_000,
      maxBytes: 2 * 1024 * 1024,
      headers: { accept: "application/json" },
    });
    if (res.status !== 200) return null;
    work = (JSON.parse(res.text()) as { message: CrossRefWork }).message;
  } catch {
    // Sandbox tests and offline runs: the caller keeps its heuristic citation.
    return null;
  }
  if (work.type && !/journal-article|proceedings-article|posted-content|report|book-chapter/i.test(work.type)) return null;
  return {
    doi,
    authors: apaAuthorsOf(work),
    year: yearOf(work),
    title: work.title?.[0] ? plainJats(work.title[0]!) : null,
    venue: venueOf(work),
    volume: work.volume?.trim() ?? null,
    issue: work.issue?.trim() ?? null,
    pages: work.page?.trim() ?? null,
  };
}

/** The cached row, else a fresh CrossRef fetch (written through). Never throws. */
export async function paperMetadata(articleId: string, doi: string): Promise<PaperMetadata | null> {
  const [cached] = await sql<PaperMetadata[]>`
    SELECT doi, authors, year, title, venue, volume, issue, pages FROM paper_metadata WHERE article_id = ${articleId}`;
  if (cached) return cached;
  const meta = await fetchCrossRef(doi);
  if (!meta) return null;
  await sql`
    INSERT INTO paper_metadata (article_id, doi, authors, year, title, venue, volume, issue, pages, fetched_at)
    VALUES (${articleId}, ${meta.doi}, ${meta.authors}, ${meta.year}, ${meta.title}, ${meta.venue}, ${meta.volume}, ${meta.issue}, ${meta.pages}, now())
    ON CONFLICT (article_id) DO NOTHING`;
  return meta;
}

/** Backfills metadata for every paper publication that has a DOI and no cached row yet. */
export async function backfillPaperMetadata(limit = 100): Promise<number> {
  const rows = await sql<{ article_id: string; url: string }[]>`
    SELECT p.article_id, a.url FROM publications p
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN paper_metadata m ON m.article_id = p.article_id
    WHERE p.category = 'paper' AND m.article_id IS NULL
    LIMIT ${limit}`;
  let n = 0;
  for (const row of rows) {
    const doi = doiOf(row.url);
    if (!doi) continue;
    if (await paperMetadata(row.article_id, doi)) n += 1;
  }
  return n;
}
