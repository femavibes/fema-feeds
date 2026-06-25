-- Persist visual editor canvas state for logic blocks (START/END wiring, positions).

ALTER TABLE logic_block_packages
  ADD COLUMN IF NOT EXISTS visual_layout JSONB;

ALTER TABLE logic_block_package_versions
  ADD COLUMN IF NOT EXISTS visual_layout JSONB;
