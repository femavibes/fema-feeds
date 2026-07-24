-- Preserve Create-tab UI mode (engagement/advanced/builder/formula) for collection edit.

ALTER TABLE sort_pack_packages
  ADD COLUMN IF NOT EXISTS editor_profile JSONB;

ALTER TABLE sort_pack_package_versions
  ADD COLUMN IF NOT EXISTS editor_profile JSONB;
