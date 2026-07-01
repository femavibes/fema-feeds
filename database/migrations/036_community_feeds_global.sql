-- Global community feeds registry table (used on marketplace.fema.monster)
-- Consumer deployments sync their public feeds here.

CREATE TABLE IF NOT EXISTS community_feeds_global (
  feed_id         TEXT NOT NULL,
  deployment_host TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  owner_did       TEXT,
  allow_as_input  BOOLEAN NOT NULL DEFAULT false,
  logic_public    BOOLEAN NOT NULL DEFAULT false,
  is_template     BOOLEAN NOT NULL DEFAULT false,
  public          BOOLEAN NOT NULL DEFAULT true,
  candidate_count INTEGER,
  published_at    TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feed_id, deployment_host)
);

CREATE INDEX IF NOT EXISTS idx_community_feeds_global_public
  ON community_feeds_global (public) WHERE public = true;
