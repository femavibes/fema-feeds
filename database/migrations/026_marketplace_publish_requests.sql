-- Publisher listing review queue (deployment master + global operator).

CREATE TABLE IF NOT EXISTS marketplace_publish_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_kind          TEXT NOT NULL CHECK (product_kind IN ('logic_block', 'sort_pack', 'plugin')),
  package_id            TEXT NOT NULL,
  owner_did             TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  requested_visibility  TEXT NOT NULL CHECK (requested_visibility IN ('deployment', 'global')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  publisher_note        TEXT,
  reviewer_did          TEXT REFERENCES users(did) ON DELETE SET NULL,
  review_note           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_publish_requests_pending
  ON marketplace_publish_requests (product_kind, package_id, requested_visibility)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_marketplace_publish_requests_queue
  ON marketplace_publish_requests (status, requested_visibility, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON marketplace_publish_requests TO cfb;
