-- Track every post successfully persisted during a stress run (not only new project tags).

CREATE TABLE IF NOT EXISTS ingest_stress_test_saved_posts (
  stress_test_id BIGINT NOT NULL REFERENCES ingest_stress_tests (id) ON DELETE CASCADE,
  post_uri       TEXT NOT NULL,
  PRIMARY KEY (stress_test_id, post_uri)
);

CREATE INDEX IF NOT EXISTS idx_ingest_stress_test_saved_posts_uri
  ON ingest_stress_test_saved_posts (post_uri);
