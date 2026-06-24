-- Deduplicate Bluesky list polling: one refresh schedule per remote source.
ALTER TABLE author_list_cache
  ADD COLUMN IF NOT EXISTS remote_poll_key TEXT;

CREATE INDEX IF NOT EXISTS idx_author_list_cache_remote_poll
  ON author_list_cache (remote_poll_key)
  WHERE remote_poll_key IS NOT NULL;
