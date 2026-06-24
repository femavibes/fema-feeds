-- Publisher-level verification (deployment master + global marketplace operator).

CREATE TABLE IF NOT EXISTS logic_block_publisher_trust (
  publisher_did     TEXT NOT NULL,
  scope             TEXT NOT NULL CHECK (scope IN ('deployment', 'global')),
  verified_by_did   TEXT REFERENCES users(did) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publisher_did, scope)
);

CREATE INDEX IF NOT EXISTS idx_logic_block_publisher_trust_scope
  ON logic_block_publisher_trust(scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON logic_block_publisher_trust TO cfb;
