-- Labeler sources + snapshot index updates (run on existing DBs).

CREATE TABLE IF NOT EXISTS labeler_sources (
  did          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  is_builtin   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO labeler_sources (did, name, enabled, is_builtin)
VALUES ('did:plc:ar7c4by46qjdydhdevvrndac', 'Bluesky Moderation', true, true)
ON CONFLICT (did) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_all_labels
  ON ingested_posts USING GIN ((summary_json->'allLabelVals'));
CREATE INDEX IF NOT EXISTS idx_ingested_posts_summary_self_labels
  ON ingested_posts USING GIN ((summary_json->'selfLabels'));

UPDATE deployment_settings
SET value_json = value_json || '{"resolveLabelerLabels": true}'::jsonb
WHERE key = 'enrichment' AND NOT (value_json ? 'resolveLabelerLabels');
