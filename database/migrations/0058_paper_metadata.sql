-- One row per paper article: metadata fetched from CrossRef by DOI, cached. The citation builder
-- prefers these over the byline/URL heuristics: journal name, volume, issue and pages turn a bare
-- link into a proper APA reference. Fetched lazily at publish time; failures stay empty and retry
-- on the article's next publication.
CREATE TABLE IF NOT EXISTS paper_metadata (
  article_id text PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  doi text NOT NULL,
  authors text,
  year integer,
  title text,
  venue text,
  volume text,
  issue text,
  pages text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
