import type {
  LogicBlockTrustTier,
  MarketplaceProductKind,
  MarketplacePublishRequest,
  MarketplacePublishRequestVisibility,
} from '@cfb/core-types'
import type pg from 'pg'
import { getLogicBlockPackageById, setLogicBlockTrustTier, setLogicBlockVisibility } from './logic-blocks.js'
import { getPluginPackageById, setPluginVisibility } from './plugins.js'
import { getSortPackPackageById, setSortPackTrustTier, setSortPackVisibility } from './sort-packs.js'

type PublishRequestRow = {
  id: string
  product_kind: MarketplaceProductKind
  package_id: string
  owner_did: string
  requested_visibility: MarketplacePublishRequestVisibility
  status: MarketplacePublishRequest['status']
  publisher_note: string | null
  reviewer_did: string | null
  review_note: string | null
  created_at: Date
  reviewed_at: Date | null
}

function rowToRequest(row: PublishRequestRow): MarketplacePublishRequest {
  return {
    id: row.id,
    productKind: row.product_kind,
    packageId: row.package_id,
    ownerDid: row.owner_did,
    requestedVisibility: row.requested_visibility,
    status: row.status,
    publisherNote: row.publisher_note,
    reviewerDid: row.reviewer_did,
    reviewNote: row.review_note,
    createdAt: row.created_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
  }
}

async function enrichRequest(
  pool: pg.Pool,
  request: MarketplacePublishRequest,
): Promise<MarketplacePublishRequest> {
  let pkg: { name: string; version: string } | null = null
  if (request.productKind === 'logic_block') {
    pkg = await getLogicBlockPackageById(pool, request.packageId)
  } else if (request.productKind === 'sort_pack') {
    pkg = await getSortPackPackageById(pool, request.packageId)
  } else {
    pkg = await getPluginPackageById(pool, request.packageId)
  }
  return {
    ...request,
    packageName: pkg?.name ?? null,
    packageVersion: pkg?.version ?? null,
  }
}

export async function createMarketplacePublishRequest(
  pool: pg.Pool,
  ownerDid: string,
  productKind: MarketplaceProductKind,
  packageId: string,
  requestedVisibility: MarketplacePublishRequestVisibility,
  publisherNote?: string | null,
): Promise<MarketplacePublishRequest | 'not_found' | 'not_owner' | 'invalid_state' | 'duplicate'> {
  let pkg: { ownerDid: string; visibility: string } | null = null
  if (productKind === 'logic_block') {
    pkg = await getLogicBlockPackageById(pool, packageId)
  } else if (productKind === 'sort_pack') {
    pkg = await getSortPackPackageById(pool, packageId)
  } else {
    pkg = await getPluginPackageById(pool, packageId)
  }
  if (!pkg) return 'not_found'
  if (pkg.ownerDid !== ownerDid) return 'not_owner'

  if (pkg.visibility === 'global') return 'invalid_state'
  if (pkg.visibility === 'deployment' && requestedVisibility === 'deployment') return 'invalid_state'
  if (pkg.visibility !== 'collection' && requestedVisibility !== 'global') return 'invalid_state'

  const dup = await pool.query(
    `SELECT 1 FROM marketplace_publish_requests
     WHERE product_kind = $1 AND package_id = $2 AND requested_visibility = $3 AND status = 'pending'
     LIMIT 1`,
    [productKind, packageId, requestedVisibility],
  )
  if (dup.rows[0]) return 'duplicate'

  const res = await pool.query<PublishRequestRow>(
    `INSERT INTO marketplace_publish_requests
       (product_kind, package_id, owner_did, requested_visibility, publisher_note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [productKind, packageId, ownerDid, requestedVisibility, publisherNote?.trim() || null],
  )
  return enrichRequest(pool, rowToRequest(res.rows[0]!))
}

export async function listPendingPublishRequests(
  pool: pg.Pool,
  scope: MarketplacePublishRequestVisibility,
): Promise<MarketplacePublishRequest[]> {
  const res = await pool.query<PublishRequestRow>(
    `SELECT * FROM marketplace_publish_requests
     WHERE status = 'pending' AND requested_visibility = $1
     ORDER BY created_at ASC`,
    [scope],
  )
  return Promise.all(res.rows.map((row) => enrichRequest(pool, rowToRequest(row))))
}

export async function listOwnerPublishRequests(
  pool: pg.Pool,
  ownerDid: string,
): Promise<MarketplacePublishRequest[]> {
  const res = await pool.query<PublishRequestRow>(
    `SELECT * FROM marketplace_publish_requests
     WHERE owner_did = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [ownerDid],
  )
  return Promise.all(res.rows.map((row) => enrichRequest(pool, rowToRequest(row))))
}

export async function getMarketplacePublishRequest(
  pool: pg.Pool,
  requestId: string,
): Promise<MarketplacePublishRequest | null> {
  const res = await pool.query<PublishRequestRow>(
    `SELECT * FROM marketplace_publish_requests WHERE id = $1`,
    [requestId],
  )
  const row = res.rows[0]
  if (!row) return null
  return enrichRequest(pool, rowToRequest(row))
}

async function markRequestReviewed(
  pool: pg.Pool,
  requestId: string,
  status: 'approved' | 'denied',
  reviewerDid: string,
  reviewNote?: string | null,
): Promise<MarketplacePublishRequest | null> {
  const res = await pool.query<PublishRequestRow>(
    `UPDATE marketplace_publish_requests
     SET status = $2,
         reviewer_did = $3,
         review_note = $4,
         reviewed_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [requestId, status, reviewerDid, reviewNote?.trim() || null],
  )
  const row = res.rows[0]
  if (!row) return null
  return enrichRequest(pool, rowToRequest(row))
}

async function applyTrustForKind(
  pool: pg.Pool,
  kind: MarketplaceProductKind,
  packageId: string,
  trustTier: LogicBlockTrustTier,
): Promise<void> {
  if (kind === 'logic_block') {
    await setLogicBlockTrustTier(pool, packageId, trustTier)
    return
  }
  if (kind === 'sort_pack') {
    await setSortPackTrustTier(pool, packageId, trustTier)
    return
  }
  await pool.query(
    `UPDATE plugin_packages SET trust_tier = $2, updated_at = NOW() WHERE id = $1`,
    [packageId, trustTier],
  )
}

export async function approveMarketplacePublishRequest(
  pool: pg.Pool,
  requestId: string,
  reviewerDid: string,
  reviewNote?: string | null,
): Promise<MarketplacePublishRequest | 'not_found' | 'publish_failed'> {
  const request = await getMarketplacePublishRequest(pool, requestId)
  if (!request || request.status !== 'pending') return 'not_found'

  const visibility = request.requestedVisibility
  const trustTier: LogicBlockTrustTier =
    visibility === 'global' ? 'global_verified' : 'deployment_verified'

  let published = false
  if (request.productKind === 'logic_block') {
    published = Boolean(
      await setLogicBlockVisibility(pool, request.packageId, request.ownerDid, visibility),
    )
  } else if (request.productKind === 'sort_pack') {
    published = Boolean(
      await setSortPackVisibility(pool, request.packageId, request.ownerDid, visibility),
    )
  } else {
    published = Boolean(
      await setPluginVisibility(pool, request.packageId, request.ownerDid, visibility),
    )
  }
  if (!published) return 'publish_failed'

  await applyTrustForKind(pool, request.productKind, request.packageId, trustTier)
  const reviewed = await markRequestReviewed(pool, requestId, 'approved', reviewerDid, reviewNote)
  return reviewed ?? 'not_found'
}

export async function denyMarketplacePublishRequest(
  pool: pg.Pool,
  requestId: string,
  reviewerDid: string,
  reviewNote?: string | null,
): Promise<MarketplacePublishRequest | null> {
  return markRequestReviewed(pool, requestId, 'denied', reviewerDid, reviewNote)
}
