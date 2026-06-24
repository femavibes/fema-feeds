-- Optional labels and kind for feed version snapshots.

ALTER TABLE feed_versions ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE feed_versions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'live';
