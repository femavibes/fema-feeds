-- Immutable semver snapshots for marketplace packages (manual subscriber pin / revert).

CREATE TABLE IF NOT EXISTS logic_block_package_versions (
  package_id    UUID NOT NULL REFERENCES logic_block_packages(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  root_group    JSONB NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_logic_block_package_versions_created
  ON logic_block_package_versions(package_id, created_at DESC);

INSERT INTO logic_block_package_versions (package_id, version, root_group, name, description, created_at)
SELECT id, version, root_group, name, description, created_at
FROM logic_block_packages
ON CONFLICT (package_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS sort_pack_package_versions (
  package_id    UUID NOT NULL REFERENCES sort_pack_packages(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  sort_key      JSONB NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_sort_pack_package_versions_created
  ON sort_pack_package_versions(package_id, created_at DESC);

INSERT INTO sort_pack_package_versions (package_id, version, sort_key, name, description, created_at)
SELECT id, version, sort_key, name, description, created_at
FROM sort_pack_packages
ON CONFLICT (package_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS plugin_package_versions (
  package_id      UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  manifest        JSONB NOT NULL,
  remote_endpoint TEXT,
  wasm_sha256     TEXT,
  wasm_size       INTEGER,
  wasm_artifact   BYTEA,
  name            TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_package_versions_created
  ON plugin_package_versions(package_id, created_at DESC);

INSERT INTO plugin_package_versions (
  package_id, version, manifest, remote_endpoint, wasm_sha256, wasm_size, wasm_artifact,
  name, description, created_at
)
SELECT
  id, version, manifest, remote_endpoint, wasm_sha256, wasm_size, wasm_artifact,
  name, description, created_at
FROM plugin_packages
ON CONFLICT (package_id, version) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON logic_block_package_versions TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON sort_pack_package_versions TO cfb;
GRANT SELECT, INSERT, UPDATE, DELETE ON plugin_package_versions TO cfb;
