import type {
  LogicBlockPackage,
  MarketplaceProductKind,
  PluginPackage,
  SortPackPackage,
} from '@cfb/core-types'
import type pg from 'pg'
import { getLogicBlockPackageById } from './logic-blocks.js'
import { getPluginPackageById } from './plugins.js'
import { getSortPackPackageById } from './sort-packs.js'
import { createMarketplacePublishRequest } from './marketplace-publish-requests.js'
import {
  insertLogicBlockVersionSnapshot,
  insertPluginVersionSnapshot,
  insertSortPackVersionSnapshot,
} from './package-version-snapshots.js'

async function ensurePublisherUser(pool: pg.Pool, ownerDid: string): Promise<void> {
  await pool.query(`INSERT INTO users (did) VALUES ($1) ON CONFLICT (did) DO NOTHING`, [ownerDid])
}

export async function stageLogicBlockForIngress(
  pool: pg.Pool,
  pkg: LogicBlockPackage,
): Promise<LogicBlockPackage> {
  await ensurePublisherUser(pool, pkg.ownerDid)
  const res = await pool.query(
    `INSERT INTO logic_block_packages
       (id, owner_did, slug, version, name, description, visibility, trust_tier, root_group)
     VALUES ($1, $2, $3, $4, $5, $6, 'collection', 'none', $7::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
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
      JSON.stringify(pkg.root),
    ],
  )
  const row = res.rows[0]
  const staged = {
    id: row.id,
    ownerDid: row.owner_did,
    slug: row.slug,
    version: row.version,
    name: row.name,
    description: row.description ?? undefined,
    visibility: row.visibility,
    trustTier: row.trust_tier,
    root: row.root_group,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
  await insertLogicBlockVersionSnapshot(pool, {
    packageId: staged.id,
    version: staged.version,
    root: staged.root,
    name: staged.name,
    description: staged.description ?? null,
  })
  return staged
}

export async function stageSortPackForIngress(
  pool: pg.Pool,
  pkg: SortPackPackage,
): Promise<SortPackPackage> {
  await ensurePublisherUser(pool, pkg.ownerDid)
  const res = await pool.query(
    `INSERT INTO sort_pack_packages
       (id, owner_did, slug, version, name, description, visibility, trust_tier, sort_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'collection', 'none', $7::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
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
      JSON.stringify(pkg.sortKey),
    ],
  )
  const row = res.rows[0]
  const staged = {
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
  await insertSortPackVersionSnapshot(pool, {
    packageId: staged.id,
    version: staged.version,
    sortKey: staged.sortKey,
    name: staged.name,
    description: staged.description ?? null,
  })
  return staged
}

export async function stagePluginForIngress(
  pool: pg.Pool,
  pkg: PluginPackage,
): Promise<PluginPackage> {
  await ensurePublisherUser(pool, pkg.ownerDid)
  const res = await pool.query(
    `INSERT INTO plugin_packages
       (id, owner_did, slug, version, name, description, kind, runtime, visibility, trust_tier, manifest, remote_endpoint)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'collection', 'none', $9::jsonb, $10)
     ON CONFLICT (id) DO UPDATE
       SET slug = EXCLUDED.slug,
           version = EXCLUDED.version,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           kind = EXCLUDED.kind,
           runtime = EXCLUDED.runtime,
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
      JSON.stringify(pkg.manifest),
      pkg.remoteEndpoint ?? null,
    ],
  )
  const row = res.rows[0]
  const staged = {
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
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
  await insertPluginVersionSnapshot(pool, {
    packageId: staged.id,
    version: staged.version,
    manifest: staged.manifest,
    remoteEndpoint: staged.remoteEndpoint,
    name: staged.name,
    description: staged.description ?? null,
  })
  return staged
}

export async function ingestGlobalListingSubmission(
  pool: pg.Pool,
  ownerDid: string,
  productKind: MarketplaceProductKind,
  pkg: LogicBlockPackage | SortPackPackage | PluginPackage,
  publisherNote?: string | null,
): Promise<
  | import('@cfb/core-types').MarketplacePublishRequest
  | 'duplicate'
  | 'invalid_owner'
> {
  if (pkg.ownerDid !== ownerDid) return 'invalid_owner'

  if (productKind === 'logic_block') {
    await stageLogicBlockForIngress(pool, pkg as LogicBlockPackage)
  } else if (productKind === 'sort_pack') {
    await stageSortPackForIngress(pool, pkg as SortPackPackage)
  } else {
    await stagePluginForIngress(pool, pkg as PluginPackage)
  }

  const result = await createMarketplacePublishRequest(
    pool,
    ownerDid,
    productKind,
    pkg.id,
    'global',
    publisherNote,
  )
  if (result === 'not_found' || result === 'not_owner' || result === 'invalid_state') {
    throw new Error(`unexpected ingress state: ${result}`)
  }
  return result
}

export async function loadPackageForIngress(
  pool: pg.Pool,
  productKind: MarketplaceProductKind,
  packageId: string,
): Promise<LogicBlockPackage | SortPackPackage | PluginPackage | null> {
  if (productKind === 'logic_block') return getLogicBlockPackageById(pool, packageId)
  if (productKind === 'sort_pack') return getSortPackPackageById(pool, packageId)
  return getPluginPackageById(pool, packageId)
}
