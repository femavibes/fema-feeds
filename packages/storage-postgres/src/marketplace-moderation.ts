import type { MarketplaceProductKind } from '@cfb/core-types'
import type pg from 'pg'

export async function moderateUnpublishPackage(
  pool: pg.Pool,
  kind: MarketplaceProductKind,
  packageId: string,
): Promise<boolean> {
  const table =
    kind === 'logic_block'
      ? 'logic_block_packages'
      : kind === 'sort_pack'
        ? 'sort_pack_packages'
        : 'plugin_packages'

  const res = await pool.query(
    `UPDATE ${table}
     SET visibility = 'collection',
         trust_tier = 'none',
         updated_at = NOW()
     WHERE id = $1 AND visibility IN ('deployment', 'global')
     RETURNING id`,
    [packageId],
  )
  return Boolean(res.rows[0])
}
