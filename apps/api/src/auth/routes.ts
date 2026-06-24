import { Agent } from '@atproto/api'
import type { Hono } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import {
  getDeploymentAccess,
  saveDeploymentAccess,
  getDeploymentInfo,
  bootstrapDeploymentFromEnv,
  bootstrapMasterFromEnv,
  getPublisherVerificationStatus,
} from '@cfb/storage-postgres'
import { canUserLogin } from '@cfb/core-types'
import { resolveOAuthPublicUrl, oauthSetupError } from '../deployment-url.js'
import {
  getOAuthClient,
  isLoginRequired,
  isOAuthConfigured,
  webOrigin,
} from './oauth.js'
import { verifyAppPasswordLogin } from './app-password.js'
import { completeUserLogin } from './complete-login.js'
import { toAuthUser } from './user-response.js'
import {
  clearBrowserSession,
  createAuthMiddleware,
  resolveSessionUser,
  SESSION_COOKIE,
} from './middleware.js'
import { getCookie } from 'hono/cookie'
import { deleteOAuthSession } from '@cfb/storage-postgres'
import { saveAtprotoSession, hasBlueskyPublishingSession } from '../bluesky-generator.js'
import { isRequestMaster, requireMaster } from '../require-master.js'
import { isGlobalVerifierUser } from '../global-marketplace.js'
import { resolveBlueskyHandle } from '../resolve-handle.js'

export function registerAuthRoutes(
  app: Hono,
  pool: Pool | null,
  rootDir: string,
): void {
  app.get('/oauth/client-metadata.json', async (c) => {
    if (!pool) return c.json({ error: 'not configured' }, 503)
    const client = await getOAuthClient(pool, rootDir)
    if (!client) return c.json({ error: oauthSetupError() }, 503)
    return c.json(client.clientMetadata)
  })

  app.get('/oauth/jwks.json', async (c) => {
    if (!pool) return c.json({ error: 'not configured' }, 503)
    const client = await getOAuthClient(pool, rootDir)
    if (!client) return c.json({ error: oauthSetupError() }, 503)
    return c.json(client.jwks)
  })

  app.get('/api/auth/status', async (c) => {
    if (pool) {
      await bootstrapDeploymentFromEnv(pool)
      await bootstrapMasterFromEnv(pool)
    }
    const publicUrl = pool ? await resolveOAuthPublicUrl(pool, rootDir) : null
    const deployment = pool ? await getDeploymentInfo(pool) : null
    const access = pool ? await getDeploymentAccess(pool) : null
    const sessionId = getCookie(c, SESSION_COOKIE)
    const user = await resolveSessionUser(pool, sessionId)
    const isMaster = user && access ? canUserLogin(user.did, access) && user.did === access.masterDid : false
    const isGlobalVerifier = user ? await isGlobalVerifierUser(pool, user.did, user.handle) : false

    const oauthConfigured = pool ? await isOAuthConfigured(pool, rootDir) : false

    return c.json({
      oauthConfigured,
      oauthPublicUrl: publicUrl,
      appPasswordLogin: isLoginRequired(),
      loginRequired: isLoginRequired(),
      oauthSetupHint: oauthConfigured ? null : oauthSetupError(),
      appUrl: publicUrl,
      deployment,
      masterDid: access?.masterDid ?? null,
      isMaster: Boolean(isMaster),
      isGlobalVerifier,
    })
  })

  app.get('/api/auth/me', async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE)
    const user = await resolveSessionUser(pool, sessionId)
    if (!user || !pool) {
      return c.json({
        user: null,
        isMaster: false,
        isGlobalVerifier: false,
        publisherVerification: null,
      })
    }
    const access = await getDeploymentAccess(pool)
    const blueskyPublishingReady = await hasBlueskyPublishingSession(pool, user.did, rootDir)
    const isGlobalVerifier = await isGlobalVerifierUser(pool, user.did, user.handle)
    const publisherVerification = await getPublisherVerificationStatus(pool, user.did, {
      handle: user.handle,
      displayName: user.displayName,
    })
    return c.json({
      user: { ...toAuthUser(user), blueskyPublishingReady },
      isMaster: user.did === access.masterDid,
      isGlobalVerifier,
      publisherVerification,
    })
  })

  app.post('/api/auth/login', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const client = await getOAuthClient(pool, rootDir)
    if (!client) {
      return c.json({ error: 'OAuth is not configured yet' }, 503)
    }
    const body = (await c.req.json<{ handle?: string }>().catch(() => ({ handle: undefined }))) ?? {
      handle: undefined,
    }
    const handle = body.handle?.trim()
    if (!handle) return c.json({ error: 'handle required' }, 400)

    const url = await client.authorize(handle, {
      scope: 'atproto transition:generic',
    })
    return c.json({ url: url.toString() })
  })

  app.post('/api/auth/login-app-password', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isLoginRequired()) {
      return c.json({ error: 'Login not required for this deployment' }, 400)
    }

    const body =
      (await c.req
        .json<{ handle?: string; appPassword?: string }>()
        .catch(() => ({ handle: undefined, appPassword: undefined }))) ?? {}
    const handle = body.handle?.trim()
    const appPassword = body.appPassword?.trim()
    if (!handle || !appPassword) {
      return c.json({ error: 'handle and app password required' }, 400)
    }

    try {
      const verified = await verifyAppPasswordLogin(handle, appPassword)
      const result = await completeUserLogin(pool, c, verified)
      if ('error' in result) {
        return c.json({ error: result.error }, 403)
      }
      await saveAtprotoSession(pool, verified.atprotoSession)
      return c.json({
        user: toAuthUser(result.user),
        isMaster: result.isMaster,
        isGlobalVerifier: result.isGlobalVerifier,
      })
    } catch (err) {
      console.error('[auth] app password login failed', err)
      const msg = err instanceof Error ? err.message : 'Login failed'
      return c.json({ error: msg }, 401)
    }
  })

  app.get('/api/auth/callback', async (c) => {
    if (!pool) return c.text('DATABASE_URL not configured', 503)
    const client = await getOAuthClient(pool, rootDir)
    if (!client) return c.text(oauthSetupError(), 503)

    try {
      const params = new URL(c.req.url).searchParams
      const { session } = await client.callback(params)
      const agent = new Agent(session)
      const profile = await agent.getProfile({ actor: session.did })
      const data = profile.data

      const result = await completeUserLogin(pool, c, {
        did: session.did,
        handle: data.handle,
        displayName: data.displayName,
        avatar: data.avatar,
      })
      if ('error' in result) {
        const origin = await webOrigin(pool, rootDir)
        return c.redirect(`${origin}/?login_error=${encodeURIComponent(result.error)}`)
      }
      const origin = await webOrigin(pool, rootDir)
      return c.redirect(`${origin}/?login=ok`)
    } catch (err) {
      console.error('[auth] callback failed', err)
      const msg = err instanceof Error ? err.message : 'OAuth callback failed'
      const origin = await webOrigin(pool, rootDir)
      return c.redirect(`${origin}/?login_error=${encodeURIComponent(msg)}`)
    }
  })

  app.post('/api/auth/logout', async (c) => {
    if (!pool) return c.json({ ok: true })
    const sessionId = getCookie(c, SESSION_COOKIE)
    const user = await resolveSessionUser(pool, sessionId)
    if (user) {
      const client = await getOAuthClient(pool, rootDir)
      if (client) {
        try {
          const oauthSession = await client.restore(user.did)
          if (oauthSession) await oauthSession.signOut()
        } catch {
          // ignore revoke errors
        }
      }
      await deleteOAuthSession(pool, user.did)
    }
    await clearBrowserSession(pool, c)
    return c.json({ ok: true })
  })

  app.get('/api/settings/access', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const access = await getDeploymentAccess(pool)
    const isMaster = await isRequestMaster(c, pool)
    return c.json({
      access: {
        masterDid: access.masterDid,
        allowedDids: access.allowedDids,
      },
      isMaster,
    })
  })

  app.patch('/api/settings/access', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate

    const body =
      (await c.req.json<{ allowedDids?: string[] }>().catch(() => null)) ?? {}
    const current = await getDeploymentAccess(pool)
    const allowedDids = Array.isArray(body.allowedDids)
      ? body.allowedDids.map((d) => d.trim()).filter((d) => d.startsWith('did:'))
      : current.allowedDids

    const next = { ...current, allowedDids }
    await saveDeploymentAccess(pool, next)
    return c.json({ access: next })
  })

  app.post('/api/settings/access/resolve-handle', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const gate = await requireMaster(c, pool)
    if (!('ok' in gate)) return gate

    const body = (await c.req.json<{ handle?: string }>().catch(() => null)) ?? {}
    const handle = body.handle?.trim()
    if (!handle) return c.json({ error: 'handle required' }, 400)

    try {
      const actor = await resolveBlueskyHandle(handle)
      return c.json({ actor })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resolve handle'
      return c.json({ error: message }, 400)
    }
  })

  app.get('/api/settings/deployment', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    await bootstrapDeploymentFromEnv(pool)
    const deployment = await getDeploymentInfo(pool)
    const isMaster = await isRequestMaster(c, pool)
    return c.json({ deployment, isMaster })
  })
}

export { createAuthMiddleware }
