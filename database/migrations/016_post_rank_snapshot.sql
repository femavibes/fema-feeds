-- Denormalized rank/scoring fields for plugin enrichment (Near You–compatible snapshot).
-- Populated at ingest from post-normalize; backfill legacy rows on read.

ALTER TABLE ingested_posts
  ADD COLUMN IF NOT EXISTS rank_snapshot JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ingested_posts_rank_media_type
  ON ingested_posts ((rank_snapshot->>'mediaType'));

COMMENT ON COLUMN ingested_posts.rank_snapshot IS
  'PostRankSnapshot JSON: mediaType, hasAltText, textLength, tag counts, embed flags, labels';
