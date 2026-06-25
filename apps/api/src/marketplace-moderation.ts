import type { Hono } from 'hono'
import type {
  MarketplaceProductKind,
  MarketplacePublishRequestVisibility,
} from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import {
  approveMarketplacePublishRequest,
  createMarketplacePublishRequest,
  denyMarketplacePublishRequest,
  listOwnerPublishRequests,
  listPendingPublishRequests,
  loadPackageForIngress,
  moderateUnpublishPackage,
} from '@cfb/storage-postgres'
import { forwardGlobalListingSubmission } from './global-registry-forward.js'
import { isCanonicalGlobalRegistryHost, isRequestGlobalVerifier } from './global-marketplace.js'
import { getUserDid } from './request-user.js'
import { isRequestMaster } from './require-master.js'

const PRODUCT_KINDS: MarketplaceProductKind[] = ['logic_block', 'sort_pack', 'plugin']

function parseProductKind(raw: unknown): MarketplaceProductKind | null {
  return typeof raw === 'string' && PRODUCT_KINDS.includes(raw as MarketplaceProductKind)
    ? (raw as MarketplaceProductKind)
    : null
}

async function packageVisibility(
  pool: Pool,
  kind: MarketplaceProductKind,
  packageId: string,
): Promise<string | null> {
  const table =
    kind === 'logic_block'
      ? 'logic_block_packages'
      : kind === 'sort_pack'
        ? 'sort_pack_packages'
        : 'plugin_packages'
  const res = await pool.query<{ visibility: string }>(
    `SELECT visibility FROM ${table} WHERE id = $1 LIMIT 1`,
    [packageId],
  )
  return res.rows[0]?.visibility ?? null
}

function parseVisibility(raw: unknown): MarketplacePublishRequestVisibility | null {
  return raw === 'deployment' || raw === 'global' ? raw : null
}

async function canModerateScope(
  c: Parameters<typeof isRequestMaster>[0],
  pool: Pool,
  scope: MarketplacePublishRequestVisibility,
): Promise<boolean> {
  if (scope === 'deployment') return isRequestMaster(c, pool)
  return isRequestGlobalVerifier(c, pool)
}

export function registerMarketplaceModerationRoutes(app: Hono, pool: Pool | null): void {
  app.post('/api/marketplace/moderation/unpublish', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const body =
      (await c.req.json<{ productKind?: unknown; packageId?: string }>().catch(() => null)) ?? {}
    const productKind = parseProductKind(body.productKind)
    const packageId = body.packageId?.trim()
    if (!productKind || !packageId) {
      return c.json({ error: 'productKind and packageId required' }, 400)
    }

    const visibility = await packageVisibility(pool, productKind, packageId)
    if (!visibility || visibility === 'collection') {
      return c.json({ error: 'listing not published' }, 400)
    }
    const scope = visibility === 'global' ? 'global' : 'deployment'
    if (!(await canModerateScope(c, pool, scope))) {
      return c.json({ error: 'moderation privileges required for this catalog' }, 403)
    }

    const ok = await moderateUnpublishPackage(pool, productKind, packageId)
    if (!ok) return c.json({ error: 'not found' }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/marketplace/publish-requests', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const scope = parseVisibility(c.req.query('scope'))
    if (!scope) return c.json({ error: 'scope=deployment|global required' }, 400)
    if (!(await canModerateScope(c, pool, scope))) {
      return c.json({ error: 'moderation privileges required' }, 403)
    }

    const requests = await listPendingPublishRequests(pool, scope)
    return c.json({ requests })
  })

  app.get('/api/marketplace/publish-requests/mine', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const requests = await listOwnerPublishRequests(pool, userDid)
    return c.json({ requests })
  })

  app.post('/api/marketplace/publish-requests', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const body =
      (await c.req
        .json<{
          productKind?: unknown
          packageId?: string
          requestedVisibility?: unknown
          publisherNote?: string
        }>()
        .catch(() => null)) ?? {}
    const productKind = parseProductKind(body.productKind)
    const packageId = body.packageId?.trim()
    const requestedVisibility = parseVisibility(body.requestedVisibility)
    if (!productKind || !packageId || !requestedVisibility) {
      return c.json({ error: 'productKind, packageId, and requestedVisibility required' }, 400)
    }

    if (requestedVisibility === 'global' && !isCanonicalGlobalRegistryHost()) {
      const pkg = await loadPackageForIngress(pool, productKind, packageId)
      if (!pkg || pkg.ownerDid !== userDid) return c.json({ error: 'not found' }, 404)

      const forwarded = await forwardGlobalListingSubmission(
        pkg,
        productKind,
        userDid,
        body.publisherNote,
        c.req.header('host') ?? null,
      )
      if (forwarded === 'duplicate') return c.json({ error: 'pending request already exists' }, 409)
      if (forwarded === 'registry_unreachable') {
        return c.json({ error: 'global registry unreachable' }, 502)
      }
      return c.json({ request: forwarded, forwarded: true }, 201)
    }

    const result = await createMarketplacePublishRequest(
      pool,
      userDid,
      productKind,
      packageId,
      requestedVisibility,
      body.publisherNote,
    )
    if (result === 'not_found') return c.json({ error: 'not found' }, 404)
    if (result === 'not_owner') return c.json({ error: 'forbidden' }, 403)
    if (result === 'invalid_state') return c.json({ error: 'package already listed at this scope' }, 400)
    if (result === 'duplicate') return c.json({ error: 'pending request already exists' }, 409)

    return c.json({ request: result }, 201)
  })

  app.post('/api/marketplace/publish-requests/:id/review', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    const userDid = getUserDid(c)
    if (!userDid) return c.json({ error: 'login_required' }, 401)

    const body =
      (await c.req.json<{ action?: 'approve' | 'deny'; reviewNote?: string }>().catch(() => null)) ??
      {}
    if (body.action !== 'approve' && body.action !== 'deny') {
      return c.json({ error: 'action approve|deny required' }, 400)
    }

    const requestId = c.req.param('id')
    const existing = await pool.query<{ requested_visibility: MarketplacePublishRequestVisibility }>(
      `SELECT requested_visibility FROM marketplace_publish_requests WHERE id = $1`,
      [requestId],
    )
    const scope = existing.rows[0]?.requested_visibility
    if (!scope) return c.json({ error: 'not found' }, 404)
    if (!(await canModerateScope(c, pool, scope))) {
      return c.json({ error: 'moderation privileges required' }, 403)
    }

    if (body.action === 'approve') {
      const result = await approveMarketplacePublishRequest(
        pool,
        requestId,
        userDid,
        body.reviewNote,
      )
      if (result === 'not_found') return c.json({ error: 'not found' }, 404)
      if (result === 'publish_failed') return c.json({ error: 'could not publish package' }, 400)
      return c.json({ request: result })
    }

    const denied = await denyMarketplacePublishRequest(pool, requestId, userDid, body.reviewNote)
    if (!denied) return c.json({ error: 'not found' }, 404)
    return c.json({ request: denied })
  })
}
