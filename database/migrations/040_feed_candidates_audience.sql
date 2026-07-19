-- Audience engagement counters on feed candidates (liked/reposted by feed viewers).
-- Required by loadPostMetrics / incrementFeedCandidateAudience; present in init.sql
-- but missing on DBs created before these columns existed.
ALTER TABLE feed_candidates
  ADD COLUMN IF NOT EXISTS audience_likes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE feed_candidates
  ADD COLUMN IF NOT EXISTS audience_reposts INTEGER NOT NULL DEFAULT 0;
