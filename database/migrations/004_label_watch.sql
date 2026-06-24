-- Periodic label re-check for pool posts (labelers apply labels after ingest).

ALTER TABLE ingested_posts
  ADD COLUMN IF NOT EXISTS labels_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ingested_posts_labels_checked
  ON ingested_posts (labels_checked_at NULLS FIRST);

UPDATE deployment_settings
SET value_json = value_json || '{
  "labelRefreshEnabled": true,
  "labelRefreshIntervalMinutes": 5,
  "labelRefreshMaxAgeDays": 7,
  "labelRefreshBatchSize": 40
}'::jsonb
WHERE key = 'enrichment'
  AND NOT (value_json ? 'labelRefreshEnabled');
