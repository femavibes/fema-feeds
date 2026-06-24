import type { LogicBlockTrustTier, PublisherTrustScope, PublisherVerificationStatus } from '@cfb/core-types'
import type pg from 'pg'

function trustTierForScope(scope: PublisherTrustScope): LogicBlockTrustTier {
  return scope === 'global' ? 'global_verified' : 'deployment_verified'
}

function visibilityForScope(scope: PublisherTrustScope): 'deployment' | 'global' {
  return scope === 'global' ? 'global' : 'deployment'
}

export async function isPublisherVerified(
  pool: pg.Pool,
  publisherDid: string,
  scope: PublisherTrustScope,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM logic_block_publisher_trust WHERE publisher_did = $1 AND scope = $2`,
    [publisherDid, scope],
  )
  return Boolean(res.rows[0])
}

export async function trustTierForPublisherVisibility(
  pool: pg.Pool,
  publisherDid: string,
  visibility: 'deployment' | 'global',
): Promise<LogicBlockTrustTier> {
  const scope: PublisherTrustScope = visibility === 'global' ? 'global' : 'deployment'
  const verified = await isPublisherVerified(pool, publisherDid, scope)
  return verified ? trustTierForScope(scope) : 'none'
}

export async function getPublisherVerificationStatus(
  pool: pg.Pool,
  publisherDid: string,
  profile?: { handle?: string | null; displayName?: string | null },
): Promise<PublisherVerificationStatus> {
  const res = await pool.query<{ scope: PublisherTrustScope; verified_at: Date }>(
    `SELECT scope, verified_at FROM logic_block_publisher_trust WHERE publisher_did = $1`,
    [publisherDid],
  )

  let deploymentVerifiedAt: string | undefined
  let globalVerifiedAt: string | undefined
  for (const row of res.rows) {
    if (row.scope === 'deployment') deploymentVerifiedAt = row.verified_at.toISOString()
    if (row.scope === 'global') globalVerifiedAt = row.verified_at.toISOString()
  }

  const userRes = await pool.query<{ handle: string | null; display_name: string | null }>(
    `SELECT handle, display_name FROM users WHERE did = $1`,
    [publisherDid],
  )
  const user = userRes.rows[0]

  return {
    publisherDid,
    handle: profile?.handle ?? user?.handle ?? null,
    displayName: profile?.displayName ?? user?.display_name ?? null,
    deploymentVerified: Boolean(deploymentVerifiedAt),
    globalVerified: Boolean(globalVerifiedAt),
    deploymentVerifiedAt,
    globalVerifiedAt,
  }
}

async function syncPackageTrustForScope(
  pool: pg.Pool,
  publisherDid: string,
  scope: PublisherTrustScope,
  trustTier: LogicBlockTrustTier,
): Promise<number> {
  const visibility = visibilityForScope(scope)
  const logicRes = await pool.query(
    `UPDATE logic_block_packages
     SET trust_tier = $3, updated_at = NOW()
     WHERE owner_did = $1 AND visibility = $2`,
    [publisherDid, visibility, trustTier],
  )
  const sortRes = await pool.query(
    `UPDATE sort_pack_packages
     SET trust_tier = $3, updated_at = NOW()
     WHERE owner_did = $1 AND visibility = $2`,
    [publisherDid, visibility, trustTier],
  )
  const pluginRes = await pool.query(
    `UPDATE plugin_packages
     SET trust_tier = $3, updated_at = NOW()
     WHERE owner_did = $1 AND visibility = $2`,
    [publisherDid, visibility, trustTier],
  )
  return (logicRes.rowCount ?? 0) + (sortRes.rowCount ?? 0) + (pluginRes.rowCount ?? 0)
}

export async function verifyPublisherScopes(
  pool: pg.Pool,
  publisherDid: string,
  scopes: PublisherTrustScope[],
  verifiedByDid: string,
): Promise<{ scopes: PublisherTrustScope[]; packagesUpdated: number }> {
  let packagesUpdated = 0
  for (const scope of scopes) {
    await pool.query(
      `INSERT INTO logic_block_publisher_trust (publisher_did, scope, verified_by_did, verified_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (publisher_did, scope) DO UPDATE
         SET verified_by_did = EXCLUDED.verified_by_did,
             verified_at = NOW()`,
      [publisherDid, scope, verifiedByDid],
    )
    packagesUpdated += await syncPackageTrustForScope(
      pool,
      publisherDid,
      scope,
      trustTierForScope(scope),
    )
  }
  return { scopes, packagesUpdated }
}

export async function revokePublisherScopes(
  pool: pg.Pool,
  publisherDid: string,
  scopes: PublisherTrustScope[],
): Promise<{ scopes: PublisherTrustScope[]; packagesUpdated: number }> {
  let packagesUpdated = 0
  for (const scope of scopes) {
    await pool.query(
      `DELETE FROM logic_block_publisher_trust WHERE publisher_did = $1 AND scope = $2`,
      [publisherDid, scope],
    )
    packagesUpdated += await syncPackageTrustForScope(pool, publisherDid, scope, 'none')
  }
  return { scopes, packagesUpdated }
}

export async function applyPublisherTrustToPackage(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: 'deployment' | 'global',
): Promise<void> {
  const trustTier = await trustTierForPublisherVisibility(pool, ownerDid, visibility)
  if (trustTier === 'none') return
  await pool.query(
    `UPDATE logic_block_packages SET trust_tier = $2, updated_at = NOW()
     WHERE id = $1 AND owner_did = $3 AND visibility = $4`,
    [packageId, trustTier, ownerDid, visibility],
  )
}

export async function applyPublisherTrustToSortPack(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: 'deployment' | 'global',
): Promise<void> {
  const trustTier = await trustTierForPublisherVisibility(pool, ownerDid, visibility)
  if (trustTier === 'none') return
  await pool.query(
    `UPDATE sort_pack_packages SET trust_tier = $2, updated_at = NOW()
     WHERE id = $1 AND owner_did = $3 AND visibility = $4`,
    [packageId, trustTier, ownerDid, visibility],
  )
}

export async function applyPublisherTrustToPlugin(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: 'deployment' | 'global',
): Promise<void> {
  const trustTier = await trustTierForPublisherVisibility(pool, ownerDid, visibility)
  if (trustTier === 'none') return
  await pool.query(
    `UPDATE plugin_packages SET trust_tier = $2, updated_at = NOW()
     WHERE id = $1 AND owner_did = $3 AND visibility = $4`,
    [packageId, trustTier, ownerDid, visibility],
  )
}
