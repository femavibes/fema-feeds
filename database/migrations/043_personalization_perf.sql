-- Personalization serve-time performance: follower cache + affinity index.

CREATE TABLE IF NOT EXISTS viewer_follower_cache (
  viewer_did      TEXT PRIMARY KEY,
  follower_dids   TEXT[] NOT NULL DEFAULT '{}',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_viewer_follower_cache_expires ON viewer_follower_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_viewer_post_interactions_viewer_feed_time
  ON viewer_post_interactions (viewer_did, feed_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cfb;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cfb;
