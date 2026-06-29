-- Post enrichments: per-enricher data attached to posts
CREATE TABLE IF NOT EXISTS post_enrichments (
  post_uri TEXT NOT NULL,
  enricher_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  data JSONB NOT NULL DEFAULT '{}',
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_uri, enricher_id)
);

CREATE INDEX IF NOT EXISTS idx_post_enrichments_enricher
  ON post_enrichments (enricher_id, enriched_at DESC);
