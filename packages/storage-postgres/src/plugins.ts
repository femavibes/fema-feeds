import type {
  PluginKind,
  PluginManifest,
  PluginPackage,
  PluginRuntime,
  PluginSubscription,
  PluginTrustTier,
  PluginUpdatePolicy,
  PluginVisibility,
} from '@cfb/core-types'
import type pg from 'pg'
import { createHash } from 'node:crypto'

import { applyPublisherTrustToPlugin } from './publisher-trust.js'

function rowToPackage(row: {
  id: string
  owner_did: string
  slug: string
  version: string
  name: string
  description: string | null
  kind: PluginKind
  runtime: PluginRuntime
  visibility: PluginVisibility
  trust_tier: PluginTrustTier
  manifest: PluginManifest
  remote_endpoint: string | null
  wasm_sha256?: string | null
  wasm_size?: number | null
  created_at: Date
  updated_at: Date
}): PluginPackage {
  return {
    id: row.id,
    ownerDid: row.owner_did,
    slug: row.slug,
    version: row.version,
    name: row.name,
    description: row.description ?? undefined,
    kind: row.kind,
    runtime: row.runtime,
    visibility: row.visibility,
    trustTier: row.trust_tier,
    manifest: row.manifest,
    remoteEndpoint: row.remote_endpoint ?? undefined,
    wasmSha256: row.wasm_sha256 ?? undefined,
    wasmSize: row.wasm_size ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function bumpPatchVersion(version: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!m) return '1.0.0'
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`
}

export async function getPluginPackageById(
  pool: pg.Pool,
  id: string,
  versionPin?: string,
): Promise<PluginPackage | null> {
  const res = versionPin
    ? await pool.query(`SELECT * FROM plugin_packages WHERE id = $1 AND version = $2`, [id, versionPin])
    : await pool.query(
        `SELECT * FROM plugin_packages WHERE id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      )
  const row = res.rows[0]
  return row ? rowToPackage(row) : null
}

export async function listPluginSubscriptions(
  pool: pg.Pool,
  ownerDid: string,
  kind?: PluginKind,
): Promise<Array<PluginSubscription & { package: PluginPackage }>> {
  const res = await pool.query(
    `SELECT s.owner_did, s.package_id, s.version_pin, s.update_policy, s.subscribed_at,
            p.*
     FROM plugin_subscriptions s
     JOIN plugin_packages p ON p.id = s.package_id AND p.version = s.version_pin
     WHERE s.owner_did = $1
       AND ($2::text IS NULL OR p.kind = $2)
     ORDER BY s.subscribed_at DESC`,
    [ownerDid, kind ?? null],
  )
  return res.rows.map((row) => ({
    ownerDid: row.owner_did,
    packageId: row.package_id,
    versionPin: row.version_pin,
    updatePolicy: row.update_policy as PluginUpdatePolicy,
    subscribedAt: row.subscribed_at.toISOString(),
    package: rowToPackage(row),
  }))
}

export interface CreatePluginInput {
  ownerDid: string
  slug: string
  name: string
  description?: string
  kind: PluginKind
  runtime: PluginRuntime
  manifest: PluginManifest
  remoteEndpoint?: string
  visibility?: PluginVisibility
}

export async function createPluginPackage(
  pool: pg.Pool,
  input: CreatePluginInput,
): Promise<PluginPackage> {
  const visibility = input.visibility ?? 'collection'
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM plugin_packages WHERE owner_did = $1 AND slug = $2 ORDER BY created_at DESC LIMIT 1`,
    [input.ownerDid, input.slug],
  )
  if (existing.rows[0]) {
    const updated = await updatePluginPackage(pool, existing.rows[0].id, input.ownerDid, {
      manifest: input.manifest,
      remoteEndpoint: input.remoteEndpoint,
      name: input.name,
      description: input.description,
      bumpVersion: true,
    })
    if (!updated) throw new Error('failed to update plugin package')
    if (visibility !== 'collection') {
      await setPluginVisibility(pool, updated.id, input.ownerDid, visibility)
      const refreshed = await getPluginPackageById(pool, updated.id, updated.version)
      return refreshed ?? updated
    }
    return updated
  }

  const version = '1.0.0'
  const res = await pool.query(
    `INSERT INTO plugin_packages
       (owner_did, slug, version, name, description, kind, runtime, visibility, manifest, remote_endpoint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     RETURNING *`,
    [
      input.ownerDid,
      input.slug,
      version,
      input.name,
      input.description ?? null,
      input.kind,
      input.runtime,
      visibility,
      JSON.stringify(input.manifest),
      input.remoteEndpoint ?? null,
    ],
  )
  let pkg = rowToPackage(res.rows[0])
  if (visibility === 'deployment' || visibility === 'global') {
    await applyPublisherTrustToPlugin(pool, pkg.id, input.ownerDid, visibility)
    const refreshed = await getPluginPackageById(pool, pkg.id, pkg.version)
    if (refreshed) pkg = refreshed
  }
  await pool.query(
    `INSERT INTO plugin_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, 'pinned')
     ON CONFLICT (owner_did, package_id) DO UPDATE SET version_pin = EXCLUDED.version_pin`,
    [input.ownerDid, pkg.id, pkg.version],
  )
  return pkg
}

export async function updatePluginPackage(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  input: {
    manifest?: PluginManifest
    remoteEndpoint?: string | null
    name?: string
    description?: string | null
    bumpVersion?: boolean
  },
): Promise<PluginPackage | null> {
  const existing = await getPluginPackageById(pool, packageId)
  if (!existing || existing.ownerDid !== ownerDid) return null
  const changed = input.manifest != null
  const bumpVersion = changed && input.bumpVersion !== false
  const version = bumpVersion ? bumpPatchVersion(existing.version) : existing.version
  const res = await pool.query(
    `UPDATE plugin_packages
     SET manifest = COALESCE($4::jsonb, manifest),
         remote_endpoint = CASE WHEN $5 THEN $6 ELSE remote_endpoint END,
         version = $7,
         name = COALESCE($8, name),
         description = CASE WHEN $9 THEN $10 ELSE description END,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2 AND version = $3
     RETURNING *`,
    [
      packageId,
      ownerDid,
      existing.version,
      input.manifest ? JSON.stringify(input.manifest) : null,
      input.remoteEndpoint !== undefined,
      input.remoteEndpoint ?? null,
      version,
      input.name?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
    ],
  )
  return res.rows[0] ? rowToPackage(res.rows[0]) : null
}

export async function subscribePlugin(
  pool: pg.Pool,
  ownerDid: string,
  packageId: string,
  versionPin: string,
  updatePolicy: PluginUpdatePolicy = 'pinned',
): Promise<void> {
  await pool.query(
    `INSERT INTO plugin_subscriptions (owner_did, package_id, version_pin, update_policy)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_did, package_id) DO UPDATE
       SET version_pin = EXCLUDED.version_pin,
           update_policy = EXCLUDED.update_policy,
           subscribed_at = NOW()`,
    [ownerDid, packageId, versionPin, updatePolicy],
  )
}

export async function setPluginVisibility(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  visibility: PluginVisibility,
): Promise<PluginPackage | null> {
  const res = await pool.query(
    `UPDATE plugin_packages
     SET visibility = $3,
         trust_tier = CASE WHEN $3 = 'collection' THEN 'none' ELSE trust_tier END,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2
     RETURNING *`,
    [packageId, ownerDid, visibility],
  )
  const row = res.rows[0]
  if (!row) return null
  if (visibility === 'deployment' || visibility === 'global') {
    await applyPublisherTrustToPlugin(pool, packageId, ownerDid, visibility)
    const refreshed = await getPluginPackageById(pool, packageId, rowToPackage(row).version)
    return refreshed ?? rowToPackage(row)
  }
  return rowToPackage(row)
}

export type PluginCatalogScope = 'deployment' | 'global' | 'all'

export async function listPluginCatalog(
  pool: pg.Pool,
  kind: PluginKind,
  scope: PluginCatalogScope = 'all',
): Promise<PluginPackage[]> {
  const visibilities =
    scope === 'deployment' ? ['deployment'] : scope === 'global' ? ['global'] : ['deployment', 'global']
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM plugin_packages
     WHERE kind = $1 AND visibility = ANY($2::text[])
     ORDER BY id, created_at DESC`,
    [kind, visibilities],
  )
  return res.rows.map(rowToPackage)
}

export async function listPluginCollection(
  pool: pg.Pool,
  ownerDid: string,
  kind?: PluginKind,
): Promise<PluginPackage[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (id) *
     FROM plugin_packages
     WHERE owner_did = $1 AND visibility = 'collection'
       AND ($2::text IS NULL OR kind = $2)
     ORDER BY id, created_at DESC`,
    [ownerDid, kind ?? null],
  )
  return res.rows.map(rowToPackage)
}

export async function listPluginPackageVersions(
  pool: pg.Pool,
  packageId: string,
): Promise<PluginPackage[]> {
  const res = await pool.query(
    `SELECT * FROM plugin_packages WHERE id = $1 ORDER BY created_at DESC`,
    [packageId],
  )
  return res.rows.map(rowToPackage)
}

export async function upsertPluginRegistryMirror(
  pool: pg.Pool,
  pkg: PluginPackage,
): Promise<PluginPackage> {
  await pool.query(`INSERT INTO users (did) VALUES ($1) ON CONFLICT (did) DO NOTHING`, [pkg.ownerDid])
  const res = await pool.query(
    `INSERT INTO plugin_packages
       (id, owner_did, slug, version, name, description, kind, runtime, visibility, trust_tier, manifest, remote_endpoint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'global', $9, $10::jsonb, $11)
     ON CONFLICT (id) DO UPDATE
       SET owner_did = EXCLUDED.owner_did,
           slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           kind = EXCLUDED.kind,
           runtime = EXCLUDED.runtime,
           visibility = 'global',
           trust_tier = EXCLUDED.trust_tier,
           manifest = EXCLUDED.manifest,
           remote_endpoint = EXCLUDED.remote_endpoint,
           updated_at = NOW()
     RETURNING *`,
    [
      pkg.id,
      pkg.ownerDid,
      pkg.slug,
      pkg.version,
      pkg.name,
      pkg.description ?? null,
      pkg.kind,
      pkg.runtime,
      pkg.trustTier,
      JSON.stringify(pkg.manifest),
      pkg.remoteEndpoint ?? null,
    ],
  )
  return rowToPackage(res.rows[0])
}

export async function getPluginWasmArtifact(
  pool: pg.Pool,
  packageId: string,
  versionPin?: string,
): Promise<{ bytes: Buffer; sha256: string } | null> {
  const res = versionPin
    ? await pool.query<{ wasm_artifact: Buffer | null; wasm_sha256: string | null }>(
        `SELECT wasm_artifact, wasm_sha256 FROM plugin_packages WHERE id = $1 AND version = $2`,
        [packageId, versionPin],
      )
    : await pool.query<{ wasm_artifact: Buffer | null; wasm_sha256: string | null }>(
        `SELECT wasm_artifact, wasm_sha256 FROM plugin_packages WHERE id = $1 ORDER BY created_at DESC LIMIT 1`,
        [packageId],
      )
  const row = res.rows[0]
  if (!row?.wasm_artifact || !row.wasm_sha256) return null
  return { bytes: row.wasm_artifact, sha256: row.wasm_sha256 }
}

export async function setPluginWasmArtifact(
  pool: pg.Pool,
  packageId: string,
  ownerDid: string,
  wasmBytes: Buffer,
): Promise<PluginPackage | null> {
  const existing = await getPluginPackageById(pool, packageId)
  if (!existing || existing.ownerDid !== ownerDid) return null
  if (existing.runtime !== 'wasm' && existing.runtime !== 'worker') return null

  const sha256 = createHash('sha256').update(wasmBytes).digest('hex')
  const version = bumpPatchVersion(existing.version)
  const res = await pool.query(
    `UPDATE plugin_packages
     SET wasm_artifact = $4,
         wasm_sha256 = $5,
         wasm_size = $6,
         version = $7,
         updated_at = NOW()
     WHERE id = $1 AND owner_did = $2 AND version = $3
     RETURNING *`,
    [packageId, ownerDid, existing.version, wasmBytes, sha256, wasmBytes.byteLength, version],
  )
  return res.rows[0] ? rowToPackage(res.rows[0]) : null
}
