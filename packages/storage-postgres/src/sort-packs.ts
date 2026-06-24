import type {
  L2Expr,
  SortPackPackage,
  SortPackSubscription,
  SortPackTrustTier,
  SortPackUpdatePolicy,
  SortPackVisibility,
} from '@cfb/core-types'
import type pg from 'pg'

import { applyPublisherTrustToSortPack } from './publisher-trust.js'

function rowToPackage(row: {
  id: string
  owner_did: string
  slug: string
  version: string
  name: string
  description: string | null
  visibility: SortPackVisibility
  trust_tier: SortPackTrustTier
  sort_key: L2Expr
  created_at: Date
  updated_at: Date
}): SortPackPackage {
  return {
    id: row.id,
    ownerDid: row.owner_did,
    slug: row.slug,
    version: row.version,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    trustTier: row.trust_tier,
    sortKey: row.sort_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function bumpPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!m) return '1.0.0'
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export async function getSortPackPackageById(
  pool: pg.Pool,
  id: string,
  versionPin?: string,
): Promise<SortPackPackage | null> {
  const res = versionPin
    ? await pool.query(`SELECT * FROM sort_pack_packages WHERE id = $1 AND version = $2`, [id, versionPin])
    : await pool.query(
        `SELECT * FROM sort_pack_packages WHERE id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      )
  const row = res.rows[0]
  return row ? rowToPackage(row) : null
}

export async function getSortPackPackagesByRefs(
  pool: pg.Pool,
  refs: Array<{ packageId: string; versionPin: string }>,
): Promise<SortPackPackage[]> {
  if (refs.length === 0) return []
  const ids = refs.map((r) => r.packageId)
  const versions = refs.map((r) => r.versionPin)
  const res = await pool.query(
    `SELECT p.*
     FROM sort_pack_packages p
     INNER JOIN UNNEST($1::uuid[], $2::text[]) AS r(id, version)
       ON p.id = r.id AND p.version = r.version`,
    [ids, versions],
  )
  return res.rows.map(rowToPackage)
}

export async function listSortPackCollection(
  pool: pg.Pool,
  ownerDid: string,
): Promise<SortPackPackage[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (slug) *
     FROM sort_pack_packages
     WHERE owner_did = $1 AND visibility = 'collection'
     ORDER BY slug, created_at DESC`,
    [ownerDid],
  )
  return res.rows.map(rowToPackage)
}

export async function listSortPackSubscriptions(
  pool: pg.Pool,
  ownerDid: string,
): Promise<Array<SortPackSubscription & { package: SortPackPackage }>> {
  const res = await pool.query(
    `SELECT s.owner_did, s.package_id, s.version_pin, s.update_policy, s.subscribed_at,
            p.id, p.owner_did AS pkg_owner_did, p.slug, p.version, p.name, p.description,
            p.visibility, p.trust_tier, p.sort_key, p.created_at, p.updated_at
     FROM sort_pack_subscriptions s
     JOIN sort_pack_packages p ON p.id = s.package_id AND p.version = s.version_pin
     WHERE s.owner_did = $1
     ORDER BY s.subscribed_at DESC`,
    [ownerDid],
  )
  return res.rows.map((row) => ({
    ownerDid: row.owner_did,
    packageId: row.package_id,
    versionPin: row.version_pin,
    updatePolicy: row.update_policy as SortPackUpdatePolicy,
    subscribedAt: row.subscribed_at.toISOString(),
    package: rowToPackage({
      id: row.id,
      owner_did: row.pkg_owner_did,
      slug: row.slug,
      version: row.version,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      trust_tier: row.trust_tier,
      sort_key: row.sort_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  }))
}

export interface CreateSortPackInput {
  ownerDid: string
  slug: string
  name: string
  description?: string
  sortKey: L2Expr
  visibility?: SortPackVisibility
}

export async function getLatestSortPackPackagesByIds(
  pool: pg.Pool,
  packageIds: string[],
): Promise<SortPackPackage[]> {
  if (packageIds.length === 0) return []
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM sort_pack_packages
     WHERE id = ANY($1::uuid[])
     ORDER BY id, created_at DESC`,
    [packageIds],
  )
  return res.rows.map(rowToPackage)
}

export async function updateSortPackPackage(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  input: {
    sortKey?: L2Expr
    name?: string
    slug?: string
    description?: string | null
    bumpVersion?: boolean
  },
): Promise<SortPackPackage | null | 'slug_taken'> {
  const existing = await getSortPackPackageById(pool, packageId)
  if (!existing || existing.ownerDid !== ownerDid) return null

  if (input.slug && input.slug !== existing.slug) {
    const clash = await pool.query(
      `SELECT id FROM sort_pack_packages
       WHERE owner_did = $1 AND slug = $2 AND id <> $3
       LIMIT 1`,
      [ownerDid, input.slug, packageId],
    )
    if (clash.rows[0]) return 'slug_taken'
  }

  const sortChanged = input.sortKey != null
  const bumpVersion = sortChanged && input.bumpVersion !== false
  const version = bumpVersion ? bumpPatchVersion(existing.version) : existing.version
  const sortJson = sortChanged ? JSON.stringify(input.sortKey) : JSON.stringify(existing.sortKey)

  const res = await pool.query(
    `UPDATE sort_pack_packages
     SET sort_key = $4::jsonb,
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
      sortJson,
      version,
      input.name?.trim() || null,
      input.slug?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
    ],
  )
  return res.rows[0] ? rowToPackage(res.rows[0]) : null
}

export async function createSortPackPackage(
  pool: pg.Pool,
  input: CreateSortPackInput,
): Promise<SortPackPackage> {
  const visibility = input.visibility ?? 'collection'
  const existing = await pool.query<{ id: string; version: string }>(
    `SELECT id, version FROM sort_pack_packages
     WHERE owner_did = $1 AND slug = $2
     ORDER BY created_at DESC LIMIT 1`,
    [input.ownerDid, input.slug],
  )
  if (existing.rows[0]) {
    const updated = await updateSortPackPackage(pool, existing.rows[0].id, input.ownerDid, {
      sortKey: input.sortKey,
      name: input.name,
      description: input.description,
      bumpVersion: true,
    })
    if (updated === 'slug_taken') throw new Error('slug already used by another sort pack')
    if (!updated) throw new Error('failed to update sort pack package')
    if (visibility !== 'collection') {
      await setSortPackVisibility(pool, updated.id, input.ownerDid, visibility)
      const refreshed = await getSortPackPackageById(pool, updated.id, updated.version)
      return refreshed ?? updated
    }
    return updated
  }

  const version = '1.0.0'
  const res = await pool.query(
    `INSERT INTO sort_pack_packages
       (owner_did, slug, version, name, description, visibility, sort_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [
      input.ownerDid,
      input.slug,
      version,
      input.name,
      input.description ?? null,
      visibility,
      JSON.stringify(input.sortKey),
    ],
  )
  let pkg = rowToPackage(res.rows[0])

  if (visibility === 'deployment' || visibility === 'global') {
    await applyPublisherTrustToSortPack(pool, pkg.id, input.ownerDid, visibility)
    const refreshed = await getSortPackPackageById(pool, pkg.id, pkg.version)
    if (refreshed) pkg = refreshed
  }

  await pool.query(
    `INSERT INTO sort_pack_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, 'pinned')
     ON CONFLICT (owner_did, package_id) DO UPDATE
       SET version_pin = EXCLUDED.version_pin, subscribed_at = NOW()`,
    [input.ownerDid, pkg.id, pkg.version],
  )

  return pkg
}

export async function subscribeSortPack(
  pool: pg.Pool,
  ownerDid: string,
  packageId: string,
  versionPin: string,
  updatePolicy: SortPackUpdatePolicy = 'pinned',
): Promise<void> {
  await pool.query(
    `INSERT INTO sort_pack_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_did, package_id) DO UPDATE
       SET version_pin = EXCLUDED.version_pin,
           update_policy = EXCLUDED.update_policy,
           subscribed_at = NOW()`,
    [ownerDid, packageId, versionPin, updatePolicy],
  )
}

export async function setSortPackVisibility(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: SortPackVisibility,
): Promise<SortPackPackage | null> {
  const res = await pool.query(
    `UPDATE sort_pack_packages
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
    await applyPublisherTrustToSortPack(pool, packageId, ownerDid, visibility)
    const refreshed = await getSortPackPackageById(pool, packageId, pkg.version)
    return refreshed ?? pkg
  }
  return pkg
}

export async function setSortPackTrustTier(
  pool: pg.Pool,
  packageId: string,
  trustTier: SortPackTrustTier,
): Promise<SortPackPackage | null> {
  const res = await pool.query(
    `UPDATE sort_pack_packages
     SET trust_tier = $2,
         updated_at = NOW()
     WHERE id = $1 AND visibility IN ('deployment', 'global')
     RETURNING *`,
    [packageId, trustTier],
  )
  return res.rows[0] ? rowToPackage(res.rows[0]) : null
}

export type SortPackCatalogScope = 'deployment' | 'global' | 'all'

export async function listSortPackCatalog(
  pool: pg.Pool,
  scope: SortPackCatalogScope = 'all',
): Promise<SortPackPackage[]> {
  const visibilities =
    scope === 'deployment' ? ['deployment'] : scope === 'global' ? ['global'] : ['deployment', 'global']
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM sort_pack_packages
     WHERE visibility = ANY($1::text[])
     ORDER BY id, created_at DESC`,
    [visibilities],
  )
  return res.rows.map(rowToPackage)
}

export async function listSortPackPackageVersions(
  pool: pg.Pool,
  packageId: string,
): Promise<SortPackPackage[]> {
  const res = await pool.query(
    `SELECT * FROM sort_pack_packages WHERE id = $1 ORDER BY created_at DESC`,
    [packageId],
  )
  return res.rows.map(rowToPackage)
}

async function ensureRegistryPublisherUser(pool: pg.Pool, ownerDid: string): Promise<void> {
  await pool.query(`INSERT INTO users (did) VALUES ($1) ON CONFLICT (did) DO NOTHING`, [ownerDid])
}

export async function upsertSortPackRegistryMirror(
  pool: pg.Pool,
  pkg: SortPackPackage,
): Promise<SortPackPackage> {
  await ensureRegistryPublisherUser(pool, pkg.ownerDid)
  const res = await pool.query(
    `INSERT INTO sort_pack_packages
       (id, owner_did, slug, version, name, description, visibility, trust_tier, sort_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'global', $7, $8::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET owner_did = EXCLUDED.owner_did,
           slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           visibility = 'global',
           trust_tier = EXCLUDED.trust_tier,
           sort_key = EXCLUDED.sort_key,
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
      JSON.stringify(pkg.sortKey),
    ],
  )
  return rowToPackage(res.rows[0])
}
