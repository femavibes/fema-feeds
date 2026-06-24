-- Real-time label stream cursors (com.atproto.label.subscribeLabels).

CREATE TABLE IF NOT EXISTS labeler_stream_cursors (
  labeler_did TEXT PRIMARY KEY,
  cursor_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE deployment_settings
SET value_json = value_json || '{"labelStreamEnabled": true}'::jsonb
WHERE key = 'enrichment'
  AND NOT (value_json ? 'labelStreamEnabled');
