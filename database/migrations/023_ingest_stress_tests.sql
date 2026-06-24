-- Benchmark options + Postgres write stress tests.

ALTER TABLE ingest_smoke_tests
  ADD COLUMN IF NOT EXISTS ignore_prefilters BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ingest_stress_tests (
  id BIGSERIAL PRIMARY KEY,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_sec INT NOT NULL,
  ignore_prefilters BOOLEAN NOT NULL DEFAULT false,
  seen INT NOT NULL,
  l1_pass INT NOT NULL,
  saved INT NOT NULL,
  save_errors INT NOT NULL,
  backlog INT NOT NULL DEFAULT 0,
  pass_rate_pct TEXT NOT NULL,
  posts_per_sec TEXT NOT NULL,
  saves_per_sec TEXT NOT NULL,
  enabled_projects INT NOT NULL,
  by_project JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingest_stress_tests_finished
  ON ingest_stress_tests (finished_at DESC);
