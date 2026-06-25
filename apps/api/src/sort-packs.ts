import type { Hono } from 'hono'
import type { L2Expr, SortPackTrustTier, SortPackVisibility } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  createSortPackPackage,
  getSortPackPackageById,
  listSortPackCatalog,
  listSortPackCollection,
  listSortPackPackageVersions,
  listSortPackSubscriptions,
  setSortPackTrustTier,
  setSortPackVisibility,
  subscribeSortPack,
  unsubscribeSortPack,
  setPackageListingMeta,
  updateSortPackPackage,
  upsertSortPackRegistryMirror,
} from '@cfb/storage-postgres'
import {
  globalMarketplaceMode,
  globalMarketplaceRegistryRole,
  isRequestGlobalVerifier,
} from './global-marketplace.js'
import {
  fetchRemoteGlobalSortPack,
  registerGlobalSortPackRegistryRoutes,
} from './global-sort-pack-registry.js'
import { resolveSortPackCatalog } from './marketplace-catalog-resolve.js'
import { getUserDid } from './request-user.js'
import { rejectOwnerGlobalVisibility } from './marketplace-visibility.js'
import { isRequestMaster } from './require-master.js'

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseCatalogScope(raw: string | undefined): 'deployment' | 'global' | 'all' {
  if (raw === 'deployment' || raw === 'global' || raw === 'all') return raw
  return 'all'
}

async function resolveSortPackForSubscribe(
  pool: Pool,
  packageId: string,
  versionPin: string,
) {
  const local = await getSortPackPackageById(pool, packageId, versionPin)
  if (local) return local
  if (globalMarketplaceRegistryRole() !== 'consumer') return null
  const remote = await fetchRemoteGlobalSortPack(packageId, versionPin)
  if (!remote) return null
  return upsertSortPackRegistryMirror(pool, remote)
}

export function registerSortPackRoutes(app: Hono, pool: Pool | null): void {
  registerGlobalSortPackRegistryRoutes(app, pool)

  app.get('/api/sort-packs/collection', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const packages = await listSortPackCollection(pool, userDid)
    return c.json({ packages })
  })

  app.get('/api/sort-packs/subscriptions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const subscriptions = await listSortPackSubscriptions(pool, userDid)
    return c.json({ subscriptions })
  })

  app.get('/api/sort-packs/catalog', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const scope = parseCatalogScope(c.req.query('scope'))
    try {
      const packages = await resolveSortPackCatalog(pool, scope)
      return c.json({ packages, scope, mode: globalMarketplaceMode() })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'registry fetch failed'
      return c.json({ error: message }, 502)
    }
  })

  app.get('/api/sort-packs/:id/versions', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const versions = await listSortPackPackageVersions(pool, c.req.param('id'))
    if (versions.length === 0) return c.json({ error: 'not found' }, 404)
    return c.json({ versions })
  })

  app.get('/api/sort-packs/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const version = c.req.query('version')
    const packageId = c.req.param('id')
    let pkg = await getSortPackPackageById(pool, packageId, version || undefined)
    if (!pkg && globalMarketplaceRegistryRole() === 'consumer') {
      try {
        const remote = await fetchRemoteGlobalSortPack(packageId, version || undefined)
        if (remote) pkg = await upsertSortPackRegistryMirror(pool, remote)
      } catch {
        return c.json({ error: 'registry fetch failed' }, 502)
      }
    }
    if (!pkg) return c.json({ error: 'not found' }, 404)
    return c.json({ package: pkg })
  })

  app.post('/api/sort-packs', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body =
      (await c.req
        .json<{
          name?: string
          slug?: string
          description?: string
          sortKey?: L2Expr
          visibility?: SortPackVisibility
        }>()
        .catch(() => null)) ?? {}
    const name = body.name?.trim()
    const slug = normalizeSlug(body.slug ?? body.name ?? '')
    const sortKey = body.sortKey
    if (!name || !slug || !sortKey) {
      return c.json({ error: 'name, slug, and sortKey required' }, 400)
    }
    const pkg = await createSortPackPackage(pool, {
      ownerDid: userDid,
      slug,
      name,
      description: body.description?.trim() || undefined,
      sortKey,
      visibility: body.visibility ?? 'collection',
    })
    return c.json({ package: pkg }, 201)
  })

  app.patch('/api/sort-packs/:id', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body =
      (await c.req
        .json<{
          name?: string
          slug?: string
          description?: string | null
          sortKey?: L2Expr
          bumpVersion?: boolean
          listing?: import('@cfb/core-types').MarketplaceListingMeta | null
        }>()
        .catch(() => null)) ?? {}
    const hasSortKey = body.sortKey != null
    const hasMeta =
      body.name !== undefined || body.slug !== undefined || body.description !== undefined
    const hasListing = body.listing !== undefined
    if (!hasSortKey && !hasMeta && !hasListing) {
      return c.json({ error: 'provide sortKey and/or name, slug, description, or listing' }, 400)
    }
    const packageId = c.req.param('id')
    let pkg: Awaited<ReturnType<typeof updateSortPackPackage>> = null
    if (hasSortKey || hasMeta) {
      const slug = body.slug !== undefined ? normalizeSlug(body.slug || body.name || '') : undefined
      if (body.slug !== undefined && !slug) return c.json({ error: 'slug required' }, 400)
      const result = await updateSortPackPackage(pool, packageId, userDid, {
        sortKey: hasSortKey ? body.sortKey : undefined,
        name: body.name?.trim(),
        slug,
        description: body.description,
        bumpVersion: body.bumpVersion ?? hasSortKey,
      })
      if (result === 'slug_taken') {
        return c.json({ error: 'slug already used by another sort pack' }, 409)
      }
      if (!result) return c.json({ error: 'not found or not owner' }, 404)
      pkg = result
    }
    if (hasListing) {
      const listingOk = await setPackageListingMeta(
        pool,
        'sort_pack_packages',
        packageId,
        userDid,
        body.listing ?? null,
      )
      if (!listingOk && !pkg) return c.json({ error: 'not found or not owner' }, 404)
    }
    const refreshed = await getSortPackPackageById(pool, packageId, pkg?.version)
    if (!refreshed) return c.json({ error: 'not found or not owner' }, 404)
    return c.json({ package: refreshed })
  })

  app.post('/api/sort-packs/:id/subscribe', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body =
      (await c.req.json<{ versionPin?: string; updatePolicy?: 'pinned' | 'notify' | 'auto_minor' }>().catch(
        () => null,
      )) ?? {}
    const versionPin = body.versionPin?.trim()
    if (!versionPin) return c.json({ error: 'versionPin required' }, 400)
    const pkg = await resolveSortPackForSubscribe(pool, c.req.param('id'), versionPin)
    if (!pkg) return c.json({ error: 'package version not found' }, 404)
    if (pkg.visibility === 'collection' && pkg.ownerDid !== userDid) {
      return c.json({ error: 'cannot subscribe to a private pack you do not own' }, 403)
    }
    await subscribeSortPack(pool, userDid, pkg.id, pkg.version, body.updatePolicy ?? 'pinned')
    return c.json({ ok: true })
  })

  app.delete('/api/sort-packs/:id/subscribe', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const ok = await unsubscribeSortPack(pool, userDid, c.req.param('id'))
    if (!ok) return c.json({ error: 'not subscribed' }, 404)
    return c.json({ ok: true })
  })

  app.patch('/api/sort-packs/:id/visibility', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body = (await c.req.json<{ visibility?: SortPackVisibility }>().catch(() => null)) ?? {}
    const visibility = body.visibility
    if (!visibility || !['collection', 'deployment', 'global'].includes(visibility)) {
      return c.json({ error: 'visibility required' }, 400)
    }
    const globalReject = rejectOwnerGlobalVisibility(visibility)
    if (globalReject) return c.json(globalReject, 400)
    const pkg = await setSortPackVisibility(pool, c.req.param('id'), userDid, visibility)
    if (!pkg) return c.json({ error: 'not found or not owner' }, 404)
    return c.json({ package: pkg })
  })

  app.patch('/api/sort-packs/:id/trust', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)
    const body = (await c.req.json<{ trustTier?: SortPackTrustTier }>().catch(() => null)) ?? {}
    const trustTier = body.trustTier
    if (!trustTier || !['none', 'deployment_verified', 'global_verified'].includes(trustTier)) {
      return c.json({ error: 'trustTier required' }, 400)
    }
    const existing = await getSortPackPackageById(pool, c.req.param('id'))
    if (!existing) return c.json({ error: 'not found' }, 404)
    if (trustTier === 'global_verified') {
      if (!(await isRequestGlobalVerifier(c, pool))) {
        return c.json({ error: 'global marketplace verifier required' }, 403)
      }
      if (existing.visibility !== 'global') {
        return c.json({ error: 'only global marketplace listings can receive global verification' }, 400)
      }
    } else if (trustTier === 'deployment_verified') {
      if (!(await isRequestMaster(c, pool))) {
        return c.json({ error: 'deployment master required to verify publishers' }, 403)
      }
      if (existing.visibility !== 'deployment') {
        return c.json({ error: 'only deployment listings can receive deployment verification' }, 400)
      }
    } else if (trustTier === 'none') {
      const isGlobalRevoke =
        existing.visibility === 'global' && existing.trustTier === 'global_verified'
      const isDeploymentRevoke =
        existing.visibility === 'deployment' && existing.trustTier === 'deployment_verified'
      if (isGlobalRevoke) {
        if (!(await isRequestGlobalVerifier(c, pool))) {
          return c.json({ error: 'global marketplace verifier required' }, 403)
        }
      } else if (isDeploymentRevoke) {
        if (!(await isRequestMaster(c, pool))) {
          return c.json({ error: 'deployment master required' }, 403)
        }
      } else {
        return c.json({ error: 'nothing to revoke' }, 400)
      }
    }
    const pkg = await setSortPackTrustTier(pool, c.req.param('id'), trustTier)
    if (!pkg) return c.json({ error: 'not found or not eligible for verification' }, 404)
    return c.json({ package: pkg })
  })
}
