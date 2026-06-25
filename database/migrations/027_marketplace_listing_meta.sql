-- Optional storefront presentation (icon, cover, product image, ratings).

ALTER TABLE logic_block_packages
  ADD COLUMN IF NOT EXISTS listing_meta JSONB;

ALTER TABLE sort_pack_packages
  ADD COLUMN IF NOT EXISTS listing_meta JSONB;

ALTER TABLE plugin_packages
  ADD COLUMN IF NOT EXISTS listing_meta JSONB;
