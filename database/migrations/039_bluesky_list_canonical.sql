-- Canonical Bluesky list membership metadata (purpose/kind/cooldown/audit).
-- list_id remains PK; for Bluesky lists we prefer list_id = backing list at:// URI.

ALTER TABLE author_list_cache
  ADD COLUMN IF NOT EXISTS list_kind TEXT,
  ADD COLUMN IF NOT EXISTS list_purpose TEXT,
  ADD COLUMN IF NOT EXISTS graph_uri TEXT,
  ADD COLUMN IF NOT EXISTS owner_did TEXT,
  ADD COLUMN IF NOT EXISTS last_manual_refresh_at TIMESTAMPTZ;

COMMENT ON COLUMN author_list_cache.list_kind IS 'list | starterpack | follow_ring | manual';
COMMENT ON COLUMN author_list_cache.list_purpose IS 'curatelist | modlist | referencelist | null';
COMMENT ON COLUMN author_list_cache.graph_uri IS 'Backing Bluesky list at:// URI (canonical membership key)';
COMMENT ON COLUMN author_list_cache.owner_did IS 'List owner DID (Jetstream filter)';
COMMENT ON COLUMN author_list_cache.last_manual_refresh_at IS 'Last user-triggered refresh (global cooldown)';

CREATE INDEX IF NOT EXISTS idx_author_list_cache_graph_uri
  ON author_list_cache (graph_uri)
  WHERE graph_uri IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_author_list_cache_owner
  ON author_list_cache (owner_did)
  WHERE owner_did IS NOT NULL;

-- Map listitem record URI → list + subject so Jetstream deletes can update membership.
CREATE TABLE IF NOT EXISTS bluesky_listitem_index (
  listitem_uri TEXT PRIMARY KEY,
  list_uri TEXT NOT NULL,
  subject_did TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_listitem_list
  ON bluesky_listitem_index (list_uri);
