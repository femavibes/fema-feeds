-- Sort key purity + recency tiebreaker + age-sweep support.
-- sort_key becomes purely the formula result; recency is a secondary sort
-- column (post_indexed_at). last_eval_at powers the age-bucketed re-eval sweep
-- for formulas that reference post_age_hours.

ALTER TABLE feed_candidates ADD COLUMN IF NOT EXISTS post_indexed_at TIMESTAMPTZ;
ALTER TABLE feed_candidates ADD COLUMN IF NOT EXISTS last_eval_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE feed_candidates fc
SET post_indexed_at = ip.indexed_at
FROM ingested_posts ip
WHERE ip.post_uri = fc.post_uri
  AND fc.post_indexed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feed_candidates_sort_tiebreak
  ON feed_candidates (feed_id, sort_key DESC, post_indexed_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_candidates_last_eval
  ON feed_candidates (feed_id, last_eval_at);

DROP INDEX IF EXISTS idx_feed_candidates_sort;
