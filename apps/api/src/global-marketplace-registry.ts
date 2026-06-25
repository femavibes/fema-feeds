import type { Hono } from 'hono'
import type { LogicBlockPackage, L2RuleGroup } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  getLogicBlockPackageById,
  listLogicBlockCatalog,
  listLogicBlockPackageVersions,
  upsertLogicBlockRegistryMirror,
} from '@cfb/storage-postgres'
import {
  globalMarketplaceRegistryRole,
  globalMarketplaceRemoteUrl,
  isCanonicalGlobalRegistryHost,
} from './global-marketplace.js'

export interface GlobalRegistryPackageSummary {
  id: string
  ownerDid: string
  slug: string
  version: string
  name: string
  description?: string
  visibility: 'global'
  trustTier: LogicBlockPackage['trustTier']
  updatedAt: string
}

export interface GlobalRegistryPackageDetail extends GlobalRegistryPackageSummary {
  root: L2RuleGroup
  createdAt: string
}

function registryBaseUrl(raw: string): string {
  return raw.replace(/\/$/, '')
}

function toSummary(pkg: LogicBlockPackage): GlobalRegistryPackageSummary {
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

function toDetail(pkg: LogicBlockPackage): GlobalRegistryPackageDetail {
  return { ...toSummary(pkg), root: pkg.root, createdAt: pkg.createdAt }
}

/** Public read API — other deployments call these when CFB_GLOBAL_MARKETPLACE_URL is set. */
export function registerGlobalMarketplaceRegistryRoutes(app: Hono, pool: Pool | null): void {
  app.get('/api/global-marketplace/catalog', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const packages = await listLogicBlockCatalog(pool, 'global')
    return c.json({ packages: packages.map(toSummary) })
  })

  app.get('/api/global-marketplace/catalog/:id/versions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const versions = await listLogicBlockPackageVersions(pool, c.req.param('id'))
    const globalVersions = versions.filter((v) => v.visibility === 'global')
    if (globalVersions.length === 0) return c.json({ error: 'not found' }, 404)
    return c.json({ versions: globalVersions.map(toSummary) })
  })

  app.get('/api/global-marketplace/catalog/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global marketplace registry not enabled on this host' }, 503)
    }
    const versionPin = c.req.query('version')?.trim()
    const pkg = await getLogicBlockPackageById(pool, c.req.param('id'), versionPin)
    if (!pkg || pkg.visibility !== 'global') return c.json({ error: 'not found' }, 404)
    return c.json({ package: toDetail(pkg) })
  })
}

export async function fetchRemoteGlobalCatalog(registryUrl: string): Promise<LogicBlockPackage[]> {
  const base = registryBaseUrl(registryUrl)
  const res = await fetch(`${base}/api/global-marketplace/catalog`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`registry catalog fetch failed (${res.status})`)
  }
  const body = (await res.json()) as { packages?: GlobalRegistryPackageSummary[] }
  const summaries = body.packages ?? []
  return summaries.map((s) => ({
    id: s.id,
    ownerDid: s.ownerDid,
    slug: s.slug,
    version: s.version,
    name: s.name,
    description: s.description,
    visibility: 'global' as const,
    trustTier: s.trustTier,
    root: { id: 'registry-stub', type: 'group', logic: 'all', children: [] },
    createdAt: s.updatedAt,
    updatedAt: s.updatedAt,
  }))
}

export async function fetchRemoteGlobalPackage(
  registryUrl: string,
  packageId: string,
  versionPin?: string,
): Promise<LogicBlockPackage | null> {
  const base = registryBaseUrl(registryUrl)
  const qs = versionPin ? `?version=${encodeURIComponent(versionPin)}` : ''
  const res = await fetch(`${base}/api/global-marketplace/catalog/${packageId}${qs}`, {
    headers: { accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`registry package fetch failed (${res.status})`)
  }
  const body = (await res.json()) as { package?: GlobalRegistryPackageDetail }
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
    root: detail.root,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}


export async function resolveGlobalPackageForSubscribe(
  pool: Pool,
  packageId: string,
  versionPin: string,
): Promise<LogicBlockPackage | null> {
  const local = await getLogicBlockPackageById(pool, packageId, versionPin)
  if (local) return local

  if (globalMarketplaceRegistryRole() !== 'consumer') return null

  const url = globalMarketplaceRemoteUrl()
  if (!url) return null

  const remote = await fetchRemoteGlobalPackage(url, packageId, versionPin)
  if (!remote) return null

  return upsertLogicBlockRegistryMirror(pool, remote)
}
