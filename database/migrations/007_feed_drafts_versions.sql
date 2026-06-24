-- Feed drafts (editor) and version history (snapshots on Update).

CREATE TABLE IF NOT EXISTS feed_drafts (
  feed_id     TEXT PRIMARY KEY,
  owner_did   TEXT NOT NULL,
  draft_json  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feed_drafts_owner ON feed_drafts(owner_did);

CREATE TABLE IF NOT EXISTS feed_versions (
  id              BIGSERIAL PRIMARY KEY,
  feed_id         TEXT NOT NULL,
  version         INT NOT NULL,
  config_json     JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_did  TEXT,
  UNIQUE (feed_id, version)
);

CREATE INDEX IF NOT EXISTS idx_feed_versions_feed ON feed_versions(feed_id, version DESC);
