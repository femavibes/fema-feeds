-- Param trigger match counters + state for native triggers (match rate, staleness, author, list)

CREATE TABLE IF NOT EXISTS feed_param_match_events (
  feed_id     TEXT NOT NULL,
  node_id     TEXT NOT NULL DEFAULT '',
  matched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_param_match_events_feed_time
  ON feed_param_match_events (feed_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_param_match_events_feed_node_time
  ON feed_param_match_events (feed_id, node_id, matched_at DESC);

CREATE TABLE IF NOT EXISTS feed_param_trigger_state (
  feed_id              TEXT PRIMARY KEY,
  last_feed_match_at   TIMESTAMPTZ,
  last_node_match_at   JSONB NOT NULL DEFAULT '{}',
  list_member_counts   JSONB NOT NULL DEFAULT '{}',
  recent_author_posts  JSONB NOT NULL DEFAULT '[]',
  pending_list_events  JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS feed_api_keys (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feed_id       TEXT NOT NULL,
  owner_did     TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT '',
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_api_keys_hash_active
  ON feed_api_keys (key_hash) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feed_api_keys_feed
  ON feed_api_keys (feed_id) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON feed_param_match_events TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_param_trigger_state TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON feed_api_keys TO cfb;
