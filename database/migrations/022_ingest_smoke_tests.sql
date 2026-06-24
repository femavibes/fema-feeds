-- Persisted Jetstream throughput smoke tests (Settings → ingest).

CREATE TABLE IF NOT EXISTS ingest_smoke_tests (
  id BIGSERIAL PRIMARY KEY,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_sec INT NOT NULL,
  seen INT NOT NULL,
  would_save INT NOT NULL,
  pass_rate_pct TEXT NOT NULL,
  posts_per_sec TEXT NOT NULL,
  enabled_projects INT NOT NULL,
  by_project JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingest_smoke_tests_finished
  ON ingest_smoke_tests (finished_at DESC);
