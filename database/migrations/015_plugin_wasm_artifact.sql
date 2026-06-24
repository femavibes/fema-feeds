-- WASM / worker plugin artifacts (verified publishers).

ALTER TABLE plugin_packages
  ADD COLUMN IF NOT EXISTS wasm_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS wasm_size INTEGER,
  ADD COLUMN IF NOT EXISTS wasm_artifact BYTEA;
