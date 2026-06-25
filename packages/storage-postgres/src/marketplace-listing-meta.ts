import type { MarketplaceListingMeta } from '@cfb/core-types'
import type pg from 'pg'

export type PublisherListingMetaInput = Pick<
  MarketplaceListingMeta,
  'iconUrl' | 'coverUrl' | 'productImageUrl'
>

export function parseListingMeta(raw: unknown): MarketplaceListingMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const meta: MarketplaceListingMeta = {}

  if (typeof o.iconUrl === 'string' && o.iconUrl.trim()) meta.iconUrl = o.iconUrl.trim()
  if (typeof o.coverUrl === 'string' && o.coverUrl.trim()) meta.coverUrl = o.coverUrl.trim()
  if (typeof o.productImageUrl === 'string' && o.productImageUrl.trim()) {
    meta.productImageUrl = o.productImageUrl.trim()
  }
  if (typeof o.ratingAverage === 'number' && Number.isFinite(o.ratingAverage)) {
    meta.ratingAverage = Math.min(5, Math.max(0, o.ratingAverage))
  }
  if (typeof o.ratingCount === 'number' && Number.isInteger(o.ratingCount) && o.ratingCount >= 0) {
    meta.ratingCount = o.ratingCount
  }

  return Object.keys(meta).length > 0 ? meta : undefined
}

/** Publisher-editable storefront fields only (no ratings). */
export function normalizePublisherListingMeta(
  input: PublisherListingMetaInput | null | undefined,
): MarketplaceListingMeta | null {
  if (!input) return null
  const meta = parseListingMeta(input)
  if (!meta) return null
  const out: MarketplaceListingMeta = {}
  if (meta.iconUrl) out.iconUrl = meta.iconUrl
  if (meta.coverUrl) out.coverUrl = meta.coverUrl
  if (meta.productImageUrl) out.productImageUrl = meta.productImageUrl
  return Object.keys(out).length > 0 ? out : null
}

type ListingMetaTable = 'logic_block_packages' | 'sort_pack_packages' | 'plugin_packages'

export async function setPackageListingMeta(
  pool: pg.Pool,
  table: ListingMetaTable,
  packageId: string,
  ownerDid: string,
  listing: PublisherListingMetaInput | null,
): Promise<boolean> {
  const normalized = normalizePublisherListingMeta(listing)
  const res = await pool.query(
    `UPDATE ${table}
     SET listing_meta = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2`,
    [packageId, ownerDid, normalized ? JSON.stringify(normalized) : null],
  )
  return (res.rowCount ?? 0) > 0
}
