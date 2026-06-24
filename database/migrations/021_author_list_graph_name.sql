-- Bluesky graph list display name (from getList), distinct from internal list_id label.
ALTER TABLE author_list_cache
  ADD COLUMN IF NOT EXISTS graph_name TEXT;
