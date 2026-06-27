-- Speed up pool scan ORDER BY indexed_at DESC (used by match-pool preview).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingested_posts_indexed_at
  ON ingested_posts (indexed_at DESC);
