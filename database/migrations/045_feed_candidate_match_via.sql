-- Candidate attribution by ingress source (pool / scout / substitute / native).
-- UI breakdown is deferred; columns support stats queries now.
-- @see docs/FEED_SOURCES_PLAN.md

ALTER TABLE feed_candidates
  ADD COLUMN IF NOT EXISTS matched_via TEXT,
  ADD COLUMN IF NOT EXISTS substitute_direction TEXT;

COMMENT ON COLUMN feed_candidates.matched_via IS
  'Ingress that matched: pool, scout, substitute, feed, project_pool, static_uri, subscribed';

COMMENT ON COLUMN feed_candidates.substitute_direction IS
  'When matched_via = substitute: reply_to_root, quote_to_quoted, etc.';

CREATE INDEX IF NOT EXISTS idx_feed_candidates_match_via
  ON feed_candidates (feed_id, matched_via);

CREATE INDEX IF NOT EXISTS idx_feed_candidates_substitute_direction
  ON feed_candidates (feed_id, substitute_direction)
  WHERE matched_via = 'substitute';
