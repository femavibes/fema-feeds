-- Native sort pack packages (collection, deployment, global marketplace).

CREATE TABLE IF NOT EXISTS sort_pack_packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_did     TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  version       TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  visibility    TEXT NOT NULL DEFAULT 'collection'
                CHECK (visibility IN ('collection', 'deployment', 'global')),
  trust_tier    TEXT NOT NULL DEFAULT 'none'
                CHECK (trust_tier IN ('none', 'deployment_verified', 'global_verified')),
  sort_key      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_did, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_sort_pack_packages_owner ON sort_pack_packages(owner_did);
CREATE INDEX IF NOT EXISTS idx_sort_pack_packages_visibility ON sort_pack_packages(visibility);

CREATE TABLE IF NOT EXISTS sort_pack_subscriptions (
  owner_did       TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  package_id      UUID NOT NULL REFERENCES sort_pack_packages(id) ON DELETE CASCADE,
  version_pin     TEXT NOT NULL,
  update_policy   TEXT NOT NULL DEFAULT 'pinned'
                  CHECK (update_policy IN ('pinned', 'notify', 'auto_minor')),
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_did, package_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON sort_pack_packages TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON sort_pack_subscriptions TO cfb;
