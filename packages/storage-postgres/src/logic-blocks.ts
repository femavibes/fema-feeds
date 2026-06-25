import type {
  LogicBlockPackage,
  LogicBlockSubscription,
  LogicBlockTrustTier,
  LogicBlockUpdatePolicy,
  LogicBlockVisibility,
  L2RuleGroup,
  L2VisualLayout,
} from '@cfb/core-types'
import type pg from 'pg'

import { applyPublisherTrustToPackage } from './publisher-trust.js'
import { parseListingMeta } from './marketplace-listing-meta.js'
import {
  insertLogicBlockVersionSnapshot,
  logicBlockVersionExists,
  patchLogicBlockVersionMetadata,
} from './package-version-snapshots.js'

function parseVisualLayout(raw: unknown): L2VisualLayout | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const layout = raw as L2VisualLayout
  if (!layout.positions || typeof layout.positions !== 'object') return undefined
  return layout
}

function rowFromVersionJoin(row: {
  id: string
  owner_did: string
  slug: string
  visibility: LogicBlockVisibility
  trust_tier: LogicBlockTrustTier
  listing_meta?: unknown
  updated_at: Date
  version: string
  root_group: L2RuleGroup
  visual_layout?: unknown
  name: string
  description: string | null
  created_at: Date
}): LogicBlockPackage {
  return {
    id: row.id,
    ownerDid: row.owner_did,
    slug: row.slug,
    version: row.version,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    trustTier: row.trust_tier,
    root: row.root_group,
    visualLayout: parseVisualLayout(row.visual_layout),
    listing: parseListingMeta(row.listing_meta),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function rowToPackage(row: {
  id: string
  owner_did: string
  slug: string
  version: string
  name: string
  description: string | null
  visibility: LogicBlockVisibility
  trust_tier: LogicBlockTrustTier
  root_group: L2RuleGroup
  visual_layout?: unknown
  listing_meta?: unknown
  created_at: Date
  updated_at: Date
}): LogicBlockPackage {
  return {
    id: row.id,
    ownerDid: row.owner_did,
    slug: row.slug,
    version: row.version,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    trustTier: row.trust_tier,
    root: row.root_group,
    visualLayout: parseVisualLayout(row.visual_layout),
    listing: parseListingMeta(row.listing_meta),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function bumpPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!m) return '1.0.0'
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export async function getLogicBlockPackageById(
  pool: pg.Pool,
  id: string,
  versionPin?: string,
): Promise<LogicBlockPackage | null> {
  if (!versionPin) {
    const res = await pool.query(`SELECT * FROM logic_block_packages WHERE id = $1`, [id])
    const row = res.rows[0]
    return row ? rowToPackage(row) : null
  }
  const res = await pool.query(
    `SELECT p.id, p.owner_did, p.slug, p.visibility, p.trust_tier, p.listing_meta, p.updated_at,
            v.version, v.root_group, v.visual_layout, v.name, v.description, v.created_at
     FROM logic_block_packages p
     INNER JOIN logic_block_package_versions v
       ON v.package_id = p.id AND v.version = $2
     WHERE p.id = $1`,
    [id, versionPin],
  )
  const row = res.rows[0]
  return row ? rowFromVersionJoin(row) : null
}

export async function getLogicBlockPackagesByRefs(
  pool: pg.Pool,
  refs: Array<{ packageId: string; versionPin: string }>,
): Promise<LogicBlockPackage[]> {
  if (refs.length === 0) return []
  const ids = refs.map((r) => r.packageId)
  const versions = refs.map((r) => r.versionPin)
  const res = await pool.query(
    `SELECT p.id, p.owner_did, p.slug, p.visibility, p.trust_tier, p.listing_meta, p.updated_at,
            v.version, v.root_group, v.visual_layout, v.name, v.description, v.created_at
     FROM logic_block_packages p
     INNER JOIN UNNEST($1::uuid[], $2::text[]) AS r(id, version)
       ON p.id = r.id
     INNER JOIN logic_block_package_versions v
       ON v.package_id = p.id AND v.version = r.version`,
    [ids, versions],
  )
  return res.rows.map(rowFromVersionJoin)
}

export async function listLogicBlocksForUser(
  pool: pg.Pool,
  userDid: string,
): Promise<LogicBlockPackage[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (p.id) p.*
     FROM logic_block_packages p
     LEFT JOIN logic_block_subscriptions s
       ON s.package_id = p.id AND s.owner_did = $1
     WHERE p.owner_did = $1
        OR p.visibility IN ('deployment', 'global')
        OR s.owner_did IS NOT NULL
     ORDER BY p.id, p.created_at DESC`,
    [userDid],
  )
  return res.rows.map(rowToPackage)
}

export async function listUserCollection(
  pool: pg.Pool,
  ownerDid: string,
): Promise<LogicBlockPackage[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (slug) *
     FROM logic_block_packages
     WHERE owner_did = $1
     ORDER BY slug, updated_at DESC`,
    [ownerDid],
  )
  return res.rows.map(rowToPackage)
}

export async function listUserSubscriptions(
  pool: pg.Pool,
  ownerDid: string,
): Promise<Array<LogicBlockSubscription & { package: LogicBlockPackage }>> {
  const res = await pool.query(
    `SELECT s.owner_did, s.package_id, s.version_pin, s.update_policy, s.subscribed_at,
            p.id, p.owner_did AS pkg_owner_did, p.slug, p.visibility, p.trust_tier, p.listing_meta,
            p.updated_at, v.version, v.root_group, v.name, v.description, v.created_at
     FROM logic_block_subscriptions s
     JOIN logic_block_packages p ON p.id = s.package_id
     JOIN logic_block_package_versions v
       ON v.package_id = s.package_id AND v.version = s.version_pin
     WHERE s.owner_did = $1
     ORDER BY s.subscribed_at DESC`,
    [ownerDid],
  )
  return res.rows.map((row) => ({
    ownerDid: row.owner_did,
    packageId: row.package_id,
    versionPin: row.version_pin,
    updatePolicy: row.update_policy as LogicBlockUpdatePolicy,
    subscribedAt: row.subscribed_at.toISOString(),
    package: rowFromVersionJoin({
      id: row.id,
      owner_did: row.pkg_owner_did,
      slug: row.slug,
      visibility: row.visibility,
      trust_tier: row.trust_tier,
      listing_meta: row.listing_meta,
      updated_at: row.updated_at,
      version: row.version,
      root_group: row.root_group,
      name: row.name,
      description: row.description,
      created_at: row.created_at,
    }),
  }))
}

export interface CreateLogicBlockInput {
  ownerDid: string
  slug: string
  name: string
  description?: string
  root: L2RuleGroup
  visualLayout?: L2VisualLayout
  visibility?: LogicBlockVisibility
}

export async function getLatestLogicBlockPackagesByIds(
  pool: pg.Pool,
  packageIds: string[],
): Promise<LogicBlockPackage[]> {
  if (packageIds.length === 0) return []
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM logic_block_packages
     WHERE id = ANY($1::uuid[])
     ORDER BY id, created_at DESC`,
    [packageIds],
  )
  return res.rows.map(rowToPackage)
}

export async function updateLogicBlockPackage(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  input: {
    root?: L2RuleGroup
    visualLayout?: L2VisualLayout | null
    name?: string
    slug?: string
    description?: string | null
    bumpVersion?: boolean
  },
): Promise<LogicBlockPackage | null | 'slug_taken'> {
  const existing = await getLogicBlockPackageById(pool, packageId)
  if (!existing || existing.ownerDid !== ownerDid) return null

  if (input.slug && input.slug !== existing.slug) {
    const clash = await pool.query(
      `SELECT id FROM logic_block_packages
       WHERE owner_did = $1 AND slug = $2 AND id <> $3
       LIMIT 1`,
      [ownerDid, input.slug, packageId],
    )
    if (clash.rows[0]) return 'slug_taken'
  }

  const logicChanged = input.root != null || input.visualLayout !== undefined
  const bumpVersion = logicChanged && input.bumpVersion !== false
  const version = bumpVersion ? bumpPatchVersion(existing.version) : existing.version
  const rootJson = input.root != null ? JSON.stringify(input.root) : JSON.stringify(existing.root)
  const visualLayoutJson =
    input.visualLayout !== undefined
      ? input.visualLayout != null
        ? JSON.stringify(input.visualLayout)
        : null
      : existing.visualLayout != null
        ? JSON.stringify(existing.visualLayout)
        : null

  const res = await pool.query(
    `UPDATE logic_block_packages
     SET root_group = $4::jsonb,
         visual_layout = $10::jsonb,
         version = $5,
         name = COALESCE($6, name),
         slug = COALESCE($7, slug),
         description = CASE WHEN $8 THEN $9 ELSE description END,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2 AND version = $3
     RETURNING *`,
    [
      packageId,
      ownerDid,
      existing.version,
      rootJson,
      version,
      input.name?.trim() || null,
      input.slug?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
      visualLayoutJson,
    ],
  )
  if (!res.rows[0]) return null
  const pkg = rowToPackage(res.rows[0])
  if (bumpVersion) {
    await insertLogicBlockVersionSnapshot(pool, {
      packageId: pkg.id,
      version: pkg.version,
      root: pkg.root,
      visualLayout: pkg.visualLayout,
      name: pkg.name,
      description: pkg.description ?? null,
    })
  } else if (input.name !== undefined || input.description !== undefined) {
    await patchLogicBlockVersionMetadata(pool, packageId, pkg.version, {
      name: input.name,
      description: input.description,
    })
  }
  return pkg
}

export async function createLogicBlockPackage(
  pool: pg.Pool,
  input: CreateLogicBlockInput,
): Promise<LogicBlockPackage> {
  const visibility = input.visibility ?? 'collection'
  const existing = await pool.query<{ id: string; version: string }>(
    `SELECT id, version FROM logic_block_packages
     WHERE owner_did = $1 AND slug = $2
     ORDER BY created_at DESC LIMIT 1`,
    [input.ownerDid, input.slug],
  )
    if (existing.rows[0]) {
    const updated = await updateLogicBlockPackage(pool, existing.rows[0].id, input.ownerDid, {
      root: input.root,
      visualLayout: input.visualLayout,
      name: input.name,
      description: input.description,
      bumpVersion: true,
    })
    if (updated === 'slug_taken') throw new Error('slug already used by another logic block')
    if (!updated) throw new Error('failed to update logic block package')
    if (visibility !== 'collection') {
      await setLogicBlockVisibility(pool, updated.id, input.ownerDid, visibility)
      const refreshed = await getLogicBlockPackageById(pool, updated.id, updated.version)
      return refreshed ?? updated
    }
    return updated
  }

  const version = '1.0.0'

  const res = await pool.query(
    `INSERT INTO logic_block_packages
       (owner_did, slug, version, name, description, visibility, root_group, visual_layout)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     RETURNING *`,
    [
      input.ownerDid,
      input.slug,
      version,
      input.name,
      input.description ?? null,
      visibility,
      JSON.stringify(input.root),
      input.visualLayout ? JSON.stringify(input.visualLayout) : null,
    ],
  )
  let pkg = rowToPackage(res.rows[0])
  await insertLogicBlockVersionSnapshot(pool, {
    packageId: pkg.id,
    version: pkg.version,
    root: pkg.root,
    visualLayout: pkg.visualLayout,
    name: pkg.name,
    description: pkg.description ?? null,
  })

  if (visibility === 'deployment' || visibility === 'global') {
    await applyPublisherTrustToPackage(pool, pkg.id, input.ownerDid, visibility)
    const refreshed = await getLogicBlockPackageById(pool, pkg.id, pkg.version)
    if (refreshed) pkg = refreshed
  }

  await pool.query(
    `INSERT INTO logic_block_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, 'pinned')
     ON CONFLICT (owner_did, package_id) DO UPDATE
       SET version_pin = EXCLUDED.version_pin, subscribed_at = NOW()`,
    [input.ownerDid, pkg.id, pkg.version],
  )

  return pkg
}

export async function subscribeLogicBlock(
  pool: pg.Pool,
  ownerDid: string,
  packageId: string,
  versionPin: string,
  updatePolicy: LogicBlockUpdatePolicy = 'pinned',
): Promise<void> {
  const versionOk = await logicBlockVersionExists(pool, packageId, versionPin)
  if (!versionOk) throw new Error('version_not_found')

  await pool.query(
    `INSERT INTO logic_block_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_did, package_id) DO UPDATE
       SET version_pin = EXCLUDED.version_pin,
           update_policy = EXCLUDED.update_policy,
           subscribed_at = NOW()`,
    [ownerDid, packageId, versionPin, updatePolicy],
  )
}

export async function unsubscribeLogicBlock(
  pool: pg.Pool,
  ownerDid: string,
  packageId: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM logic_block_subscriptions WHERE owner_did = $1 AND package_id = $2`,
    [ownerDid, packageId],
  )
  return (res.rowCount ?? 0) > 0
}

export async function setLogicBlockVisibility(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: LogicBlockVisibility,
): Promise<LogicBlockPackage | null> {
  const res = await pool.query(
    `UPDATE logic_block_packages
     SET visibility = $3,
         trust_tier = CASE
           WHEN $3 = 'collection' THEN 'none'
           WHEN $3 = 'global' THEN trust_tier
           ELSE trust_tier
         END,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2
     RETURNING *`,
    [packageId, ownerDid, visibility],
  )
  const row = res.rows[0]
  if (!row) return null
  const pkg = rowToPackage(row)
  if (visibility === 'deployment' || visibility === 'global') {
    await applyPublisherTrustToPackage(pool, packageId, ownerDid, visibility)
    const refreshed = await getLogicBlockPackageById(pool, packageId, pkg.version)
    return refreshed ?? pkg
  }
  return pkg
}

export async function setLogicBlockTrustTier(
  pool: pg.Pool,
  packageId: string,
  trustTier: LogicBlockTrustTier,
): Promise<LogicBlockPackage | null> {
  const res = await pool.query(
    `UPDATE logic_block_packages
     SET trust_tier = $2,
         updated_at = NOW()
     WHERE id = $1 AND visibility IN ('deployment', 'global')
     RETURNING *`,
    [packageId, trustTier],
  )
  return res.rows[0] ? rowToPackage(res.rows[0]) : null
}

export async function listDeploymentCatalog(pool: pg.Pool): Promise<LogicBlockPackage[]> {
  return listLogicBlockCatalog(pool, 'all')
}

export type LogicBlockCatalogScope = 'deployment' | 'global' | 'all'

export async function listLogicBlockCatalog(
  pool: pg.Pool,
  scope: LogicBlockCatalogScope = 'all',
): Promise<LogicBlockPackage[]> {
  const visibilities =
    scope === 'deployment' ? ['deployment'] : scope === 'global' ? ['global'] : ['deployment', 'global']
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM logic_block_packages
     WHERE visibility = ANY($1::text[])
     ORDER BY id, created_at DESC`,
    [visibilities],
  )
  return res.rows.map(rowToPackage)
}

export async function listLogicBlockPackageVersions(
  pool: pg.Pool,
  packageId: string,
): Promise<LogicBlockPackage[]> {
  const res = await pool.query(
    `SELECT p.id, p.owner_did, p.slug, p.visibility, p.trust_tier, p.listing_meta, p.updated_at,
            v.version, v.root_group, v.visual_layout, v.name, v.description, v.created_at
     FROM logic_block_package_versions v
     INNER JOIN logic_block_packages p ON p.id = v.package_id
     WHERE v.package_id = $1
     ORDER BY v.created_at DESC`,
    [packageId],
  )
  return res.rows.map(rowFromVersionJoin)
}

async function ensureRegistryPublisherUser(pool: pg.Pool, ownerDid: string): Promise<void> {
  await pool.query(
    `INSERT INTO users (did) VALUES ($1) ON CONFLICT (did) DO NOTHING`,
    [ownerDid],
  )
}

/** Cache a global registry package locally so subscriptions and eval can resolve it. */
export async function upsertLogicBlockRegistryMirror(
  pool: pg.Pool,
  pkg: LogicBlockPackage,
): Promise<LogicBlockPackage> {
  await ensureRegistryPublisherUser(pool, pkg.ownerDid)
  const res = await pool.query(
    `INSERT INTO logic_block_packages
       (id, owner_did, slug, version, name, description, visibility, trust_tier, root_group)
     VALUES ($1, $2, $3, $4, $5, $6, 'global', $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET owner_did = EXCLUDED.owner_did,
           slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           visibility = 'global',
           trust_tier = EXCLUDED.trust_tier,
           root_group = EXCLUDED.root_group,
           updated_at = NOW()
     RETURNING *`,
    [
      pkg.id,
      pkg.ownerDid,
      pkg.slug,
      pkg.version,
      pkg.name,
      pkg.description ?? null,
      pkg.trustTier,
      JSON.stringify(pkg.root),
    ],
  )
  const mirrored = rowToPackage(res.rows[0])
  await insertLogicBlockVersionSnapshot(pool, {
    packageId: mirrored.id,
    version: mirrored.version,
    root: mirrored.root,
    name: mirrored.name,
    description: mirrored.description ?? null,
  })
  return mirrored
}
