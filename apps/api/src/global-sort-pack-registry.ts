import type { Hono } from 'hono'
import type { L2Expr, SortPackPackage } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  getSortPackPackageById,
  listSortPackCatalog,
  listSortPackPackageVersions,
} from '@cfb/storage-postgres'
import {
  globalMarketplaceRemoteUrl,
  isGlobalMarketplaceOperatorInstance,
} from './global-marketplace.js'

export interface GlobalRegistrySortPackSummary {
  id: string
  ownerDid: string
  slug: string
  version: string
  name: string
  description?: string
  visibility: 'global'
  trustTier: SortPackPackage['trustTier']
  updatedAt: string
}

export interface GlobalRegistrySortPackDetail extends GlobalRegistrySortPackSummary {
  sortKey: L2Expr
  createdAt: string
}

function registryBaseUrl(): string {
  const raw = globalMarketplaceRemoteUrl()
  if (!raw) throw new Error('CFB_GLOBAL_MARKETPLACE_URL not configured')
  return raw.replace(/\/$/, '')
}

function toSummary(pkg: SortPackPackage): GlobalRegistrySortPackSummary {
  return {
    id: pkg.id,
    ownerDid: pkg.ownerDid,
    slug: pkg.slug,
    version: pkg.version,
    name: pkg.name,
    description: pkg.description,
    visibility: 'global',
    trustTier: pkg.trustTier,
    updatedAt: pkg.updatedAt,
  }
}

function toDetail(pkg: SortPackPackage): GlobalRegistrySortPackDetail {
  return { ...toSummary(pkg), sortKey: pkg.sortKey, createdAt: pkg.createdAt }
}

export function registerGlobalSortPackRegistryRoutes(app: Hono, pool: Pool | null): void {
  app.get('/api/global-marketplace/sort-packs/catalog', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isGlobalMarketplaceOperatorInstance()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const packages = await listSortPackCatalog(pool, 'global')
    return c.json({ packages: packages.map(toSummary) })
  })

  app.get('/api/global-marketplace/sort-packs/catalog/:id/versions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isGlobalMarketplaceOperatorInstance()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const versions = await listSortPackPackageVersions(pool, c.req.param('id'))
    const globalVersions = versions.filter((v) => v.visibility === 'global')
    if (globalVersions.length === 0) return c.json({ error: 'not found' }, 404)
    return c.json({ versions: globalVersions.map(toSummary) })
  })

  app.get('/api/global-marketplace/sort-packs/catalog/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isGlobalMarketplaceOperatorInstance()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const versionPin = c.req.query('version')?.trim()
    const pkg = await getSortPackPackageById(pool, c.req.param('id'), versionPin)
    if (!pkg || pkg.visibility !== 'global') return c.json({ error: 'not found' }, 404)
    return c.json({ package: toDetail(pkg) })
  })
}

export async function fetchRemoteGlobalSortPackCatalog(): Promise<SortPackPackage[]> {
  const base = registryBaseUrl()
  const res = await fetch(`${base}/api/global-marketplace/sort-packs/catalog`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`registry sort pack catalog fetch failed (${res.status})`)
  const body = (await res.json()) as { packages?: GlobalRegistrySortPackSummary[] }
  return (body.packages ?? []).map((s) => ({
    id: s.id,
    ownerDid: s.ownerDid,
    slug: s.slug,
    version: s.version,
    name: s.name,
    description: s.description,
    visibility: 'global' as const,
    trustTier: s.trustTier,
    sortKey: { type: 'literal' as const, value: 0 },
    createdAt: s.updatedAt,
    updatedAt: s.updatedAt,
  }))
}

export async function fetchRemoteGlobalSortPack(
  packageId: string,
  versionPin?: string,
): Promise<SortPackPackage | null> {
  const base = registryBaseUrl()
  const qs = versionPin ? `?version=${encodeURIComponent(versionPin)}` : ''
  const res = await fetch(`${base}/api/global-marketplace/sort-packs/catalog/${packageId}${qs}`, {
    headers: { accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`registry sort pack fetch failed (${res.status})`)
  const body = (await res.json()) as { package?: GlobalRegistrySortPackDetail }
  const detail = body.package
  if (!detail) return null
  return {
    id: detail.id,
    ownerDid: detail.ownerDid,
    slug: detail.slug,
    version: detail.version,
    name: detail.name,
    description: detail.description,
    visibility: 'global',
    trustTier: detail.trustTier,
    sortKey: detail.sortKey,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}
