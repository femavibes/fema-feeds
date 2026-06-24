-- Track per-run pool writes so stress-test posts can be purged precisely.

ALTER TABLE ingest_stress_tests
  ADD COLUMN IF NOT EXISTS write_success_pct TEXT NOT NULL DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_posts INT;

CREATE TABLE IF NOT EXISTS ingest_stress_test_posts (
  stress_test_id BIGINT NOT NULL REFERENCES ingest_stress_tests (id) ON DELETE CASCADE,
  post_uri       TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  PRIMARY KEY (stress_test_id, post_uri, project_id)
);

CREATE INDEX IF NOT EXISTS idx_ingest_stress_test_posts_uri
  ON ingest_stress_test_posts (post_uri);
