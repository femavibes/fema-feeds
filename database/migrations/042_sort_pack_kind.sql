-- Distinguish sort formulas from personalization formulas in the same pack table.

ALTER TABLE sort_pack_packages
  ADD COLUMN IF NOT EXISTS pack_kind TEXT NOT NULL DEFAULT 'sort'
  CHECK (pack_kind IN ('sort', 'personalization'));

CREATE INDEX IF NOT EXISTS idx_sort_pack_packages_kind
  ON sort_pack_packages(owner_did, pack_kind);
