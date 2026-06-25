-- Add editor_score column to feed_candidates (accumulated from Score nodes in L2 graph)
ALTER TABLE feed_candidates ADD COLUMN IF NOT EXISTS editor_score INTEGER NOT NULL DEFAULT 0;
