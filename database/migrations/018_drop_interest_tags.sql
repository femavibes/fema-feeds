-- Revert migration 017: deployment interest taxonomy is out of scope for CFB core.
-- Rankers use candidatePosts[].labelVals for moderation signals.

DROP TABLE IF EXISTS post_interest_tags;
DROP TABLE IF EXISTS interest_match_rules;
DROP TABLE IF EXISTS interest_topics;
