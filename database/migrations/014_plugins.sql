-- Marketplace plugin packages (injectors, rankers) + subscriptions.

CREATE TABLE IF NOT EXISTS plugin_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_did       TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  slug            TEXT NOT NULL,
  version         TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  kind            TEXT NOT NULL CHECK (kind IN ('injector', 'ranker')),
  runtime         TEXT NOT NULL CHECK (runtime IN ('native', 'remote', 'worker', 'wasm')),
  visibility      TEXT NOT NULL DEFAULT 'collection'
                  CHECK (visibility IN ('collection', 'deployment', 'global')),
  trust_tier      TEXT NOT NULL DEFAULT 'none'
                  CHECK (trust_tier IN ('none', 'deployment_verified', 'global_verified')),
  manifest        JSONB NOT NULL,
  remote_endpoint TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_did, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_packages_kind ON plugin_packages(kind);
CREATE INDEX IF NOT EXISTS idx_plugin_packages_visibility ON plugin_packages(visibility);

CREATE TABLE IF NOT EXISTS plugin_subscriptions (
  owner_did       TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  package_id      UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
  version_pin     TEXT NOT NULL,
  update_policy   TEXT NOT NULL DEFAULT 'pinned'
                  CHECK (update_policy IN ('pinned', 'notify', 'auto_minor')),
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_did, package_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON plugin_packages TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON plugin_subscriptions TO cfb;
