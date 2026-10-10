-- The citation read dedupes lookups across articles that share a DOI: a small index is plenty.
CREATE INDEX CONCURRENTLY IF NOT EXISTS paper_metadata_doi_idx ON paper_metadata (doi);
