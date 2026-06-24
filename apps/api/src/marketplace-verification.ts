import type { Hono } from 'hono'
import type { PublisherTrustScope } from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  getPublisherVerificationStatus,
  revokePublisherScopes,
  verifyPublisherScopes,
} from '@cfb/storage-postgres'
import { isRequestGlobalVerifier } from './global-marketplace.js'
import { resolveBlueskyHandle } from './resolve-handle.js'
import { getUserDid } from './request-user.js'
import { isRequestMaster } from './require-master.js'

function parseScopes(raw: unknown): PublisherTrustScope[] | null {
  if (!Array.isArray(raw)) return null
  const scopes = raw.filter((s): s is PublisherTrustScope => s === 'deployment' || s === 'global')
  return scopes.length > 0 ? scopes : null
}

export function registerMarketplaceVerificationRoutes(app: Hono, pool: Pool | null): void {
  app.get('/api/marketplace/publisher-verification', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const isMaster = await isRequestMaster(c, pool)
    const isGlobalVerifier = await isRequestGlobalVerifier(c, pool)
    if (!isMaster && !isGlobalVerifier) {
      return c.json({ error: 'verification privileges required' }, 403)
    }

    const handle = c.req.query('handle')?.trim()
    if (!handle) return c.json({ error: 'handle required' }, 400)

    try {
      const actor = await resolveBlueskyHandle(handle)
      const status = await getPublisherVerificationStatus(pool, actor.did, {
        handle: actor.handle,
        displayName: actor.displayName,
      })
      return c.json({
        status,
        canVerifyDeployment: isMaster,
        canVerifyGlobal: isGlobalVerifier,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resolve handle'
      return c.json({ error: message }, 400)
    }
  })

  app.post('/api/marketplace/publisher-verification', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const isMaster = await isRequestMaster(c, pool)
    const isGlobalVerifier = await isRequestGlobalVerifier(c, pool)

    const body =
      (await c.req
        .json<{ handle?: string; scopes?: unknown; action?: 'verify' | 'revoke' }>()
        .catch(() => null)) ?? {}

    const handle = body.handle?.trim()
    const scopes = parseScopes(body.scopes)
    const action = body.action
    if (!handle || !scopes || !action) {
      return c.json({ error: 'handle, scopes, and action required' }, 400)
    }

    for (const scope of scopes) {
      if (scope === 'deployment' && !isMaster) {
        return c.json({ error: 'deployment master required for deployment verification' }, 403)
      }
      if (scope === 'global' && !isGlobalVerifier) {
        return c.json({ error: 'global marketplace operator required for global verification' }, 403)
      }
    }

    try {
      const actor = await resolveBlueskyHandle(handle)
      const result =
        action === 'verify'
          ? await verifyPublisherScopes(pool, actor.did, scopes, userDid)
          : await revokePublisherScopes(pool, actor.did, scopes)

      const status = await getPublisherVerificationStatus(pool, actor.did, {
        handle: actor.handle,
        displayName: actor.displayName,
      })

      return c.json({
        ok: true,
        action,
        packagesUpdated: result.packagesUpdated,
        status,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed'
      return c.json({ error: message }, 400)
    }
  })
}
