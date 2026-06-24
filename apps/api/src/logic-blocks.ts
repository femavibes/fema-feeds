import type { Hono } from 'hono'
import type { LogicBlockTrustTier, LogicBlockVisibility, L2RuleGroup } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'

import {

  createLogicBlockPackage,

  getLogicBlockPackageById,

  listLogicBlocksForUser,

  listLogicBlockPackageVersions,

  listUserCollection,

  listUserSubscriptions,

  setLogicBlockVisibility,

  setLogicBlockTrustTier,

  subscribeLogicBlock,

  updateLogicBlockPackage,

  upsertLogicBlockRegistryMirror,

} from '@cfb/storage-postgres'

import {
  globalMarketplaceMode,
  globalMarketplaceRemoteUrl,
  globalMarketplaceRegistryRole,
  globalMarketplaceStatusHint,
  GLOBAL_MARKETPLACE_OPERATOR_HANDLE,
  isGlobalMarketplaceOperatorInstance,
  isRequestGlobalVerifier,
} from './global-marketplace.js'
import {
  fetchRemoteGlobalPackage,
  registerGlobalMarketplaceRegistryRoutes,
  resolveGlobalCatalogPackages,
  resolveGlobalPackageForSubscribe,
} from './global-marketplace-registry.js'

import { getUserDid } from './request-user.js'

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



export function registerLogicBlockRoutes(app: Hono, pool: Pool | null): void {
  registerGlobalMarketplaceRegistryRoutes(app, pool)

  app.get('/api/global-marketplace/status', async (c) => {
    const role = globalMarketplaceRegistryRole()
    return c.json({
      mode: globalMarketplaceMode(),
      remoteUrl: globalMarketplaceRemoteUrl(),
      operatorInstance: isGlobalMarketplaceOperatorInstance(),
      registryRole: role,
      verifierHandle: GLOBAL_MARKETPLACE_OPERATOR_HANDLE,
      publicCatalogPath: '/api/global-marketplace/catalog',
      hint: globalMarketplaceStatusHint(role),
    })
  })



  app.get('/api/logic-blocks', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const packages = await listLogicBlocksForUser(pool, userDid)

    return c.json({ packages })

  })



  app.get('/api/logic-blocks/collection', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const packages = await listUserCollection(pool, userDid)

    return c.json({ packages })

  })



  app.get('/api/logic-blocks/subscriptions', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const subscriptions = await listUserSubscriptions(pool, userDid)

    return c.json({ subscriptions })

  })



  app.get('/api/logic-blocks/catalog', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const scope = parseCatalogScope(c.req.query('scope'))

    try {
      const packages = pool
        ? await resolveGlobalCatalogPackages(pool, scope)
        : []
      return c.json({
        packages,
        scope,
        mode: globalMarketplaceMode(),
        registryRole: globalMarketplaceRegistryRole(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'registry fetch failed'
      return c.json({ error: message }, 502)
    }

  })



  app.get('/api/logic-blocks/:id/versions', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const versions = await listLogicBlockPackageVersions(pool, c.req.param('id'))

    if (versions.length === 0) return c.json({ error: 'not found' }, 404)

    return c.json({ versions })

  })



  app.get('/api/logic-blocks/:id', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const version = c.req.query('version')

    const packageId = c.req.param('id')

    let pkg = await getLogicBlockPackageById(pool, packageId, version || undefined)

    if (!pkg && globalMarketplaceRegistryRole() === 'consumer') {
      const registryUrl = globalMarketplaceRemoteUrl()
      if (registryUrl) {
        try {
          const remote = await fetchRemoteGlobalPackage(registryUrl, packageId, version || undefined)
          if (remote) pkg = await upsertLogicBlockRegistryMirror(pool, remote)
        } catch {
          return c.json({ error: 'registry fetch failed' }, 502)
        }
      }
    }

    if (!pkg) return c.json({ error: 'not found' }, 404)

    return c.json({ package: pkg })

  })



  app.post('/api/logic-blocks', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req

        .json<{

          name?: string

          slug?: string

          description?: string

          root?: L2RuleGroup

          visibility?: LogicBlockVisibility

        }>()

        .catch(() => null)) ?? {}



    const name = body.name?.trim()

    const slug = normalizeSlug(body.slug ?? body.name ?? '')

    const root = body.root

    if (!name || !slug || !root || root.type !== 'group') {

      return c.json({ error: 'name, slug, and root group required' }, 400)

    }



    const visibility = body.visibility ?? 'collection'



    const pkg = await createLogicBlockPackage(pool, {

      ownerDid: userDid,

      slug,

      name,

      description: body.description?.trim() || undefined,

      root,

      visibility,

    })

    return c.json({ package: pkg }, 201)

  })



  app.patch('/api/logic-blocks/:id', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req

        .json<{

          name?: string

          slug?: string

          description?: string | null

          root?: L2RuleGroup

          bumpVersion?: boolean

        }>()

        .catch(() => null)) ?? {}



    const hasRoot = body.root != null && body.root.type === 'group'

    const hasMeta =

      body.name !== undefined ||

      body.slug !== undefined ||

      body.description !== undefined



    if (!hasRoot && !hasMeta) {

      return c.json({ error: 'provide root and/or name, slug, or description' }, 400)

    }



    const slug = body.slug !== undefined ? normalizeSlug(body.slug || body.name || '') : undefined

    if (body.slug !== undefined && !slug) {

      return c.json({ error: 'slug required' }, 400)

    }



    const result = await updateLogicBlockPackage(pool, c.req.param('id'), userDid, {

      root: hasRoot ? body.root : undefined,

      name: body.name?.trim(),

      slug,

      description: body.description,

      bumpVersion: body.bumpVersion ?? hasRoot,

    })

    if (result === 'slug_taken') {

      return c.json({ error: 'slug already used by another logic block' }, 409)

    }

    if (!result) return c.json({ error: 'not found or not owner' }, 404)

    return c.json({ package: result })

  })



  app.post('/api/logic-blocks/:id/subscribe', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req.json<{ versionPin?: string; updatePolicy?: 'pinned' | 'notify' | 'auto_minor' }>().catch(

        () => null,

      )) ?? {}

    const versionPin = body.versionPin?.trim()

    if (!versionPin) return c.json({ error: 'versionPin required' }, 400)



    const pkg = await resolveGlobalPackageForSubscribe(pool, c.req.param('id'), versionPin)

    if (!pkg) return c.json({ error: 'package version not found' }, 404)

    if (pkg.visibility === 'collection' && pkg.ownerDid !== userDid) {

      return c.json({ error: 'cannot subscribe to a private block you do not own' }, 403)

    }



    await subscribeLogicBlock(pool, userDid, pkg.id, pkg.version, body.updatePolicy ?? 'pinned')

    return c.json({ ok: true })

  })



  app.patch('/api/logic-blocks/:id/visibility', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req.json<{ visibility?: LogicBlockVisibility }>().catch(() => null)) ?? {}

    const visibility = body.visibility

    if (!visibility || !['collection', 'deployment', 'global'].includes(visibility)) {

      return c.json({ error: 'visibility required' }, 400)

    }



    const pkg = await setLogicBlockVisibility(pool, c.req.param('id'), userDid, visibility)

    if (!pkg) return c.json({ error: 'not found or not owner' }, 404)

    return c.json({ package: pkg })

  })



  app.patch('/api/logic-blocks/:id/trust', async (c) => {

    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)

    const userDid = getUserDid(c)

    if (!userDid) return c.json({ error: 'login_required' }, 401)



    const body =

      (await c.req.json<{ trustTier?: LogicBlockTrustTier }>().catch(() => null)) ?? {}

    const trustTier = body.trustTier

    if (!trustTier || !['none', 'deployment_verified', 'global_verified'].includes(trustTier)) {

      return c.json({ error: 'trustTier required' }, 400)

    }



    const existing = await getLogicBlockPackageById(pool, c.req.param('id'))

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



    const pkg = await setLogicBlockTrustTier(pool, c.req.param('id'), trustTier)

    if (!pkg) return c.json({ error: 'not found or not eligible for verification' }, 404)

    return c.json({ package: pkg })

  })

}

