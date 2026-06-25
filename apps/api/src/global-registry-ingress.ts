import type { Hono } from 'hono'
import type {
  LogicBlockPackage,
  MarketplaceProductKind,
  PluginPackage,
  SortPackPackage,
} from '@cfb/core-types'
import type { Pool } from '@cfb/storage-postgres'
import { ingestGlobalListingSubmission } from '@cfb/storage-postgres'
import { isCanonicalGlobalRegistryHost } from './global-marketplace.js'

const PRODUCT_KINDS: MarketplaceProductKind[] = ['logic_block', 'sort_pack', 'plugin']

function parseProductKind(raw: unknown): MarketplaceProductKind | null {
  return typeof raw === 'string' && PRODUCT_KINDS.includes(raw as MarketplaceProductKind)
    ? (raw as MarketplaceProductKind)
    : null
}

function resolvePackage(
  kind: MarketplaceProductKind,
  body: {
    logicBlock?: LogicBlockPackage
    sortPack?: SortPackPackage
    plugin?: PluginPackage
  },
): LogicBlockPackage | SortPackPackage | PluginPackage | null {
  if (kind === 'logic_block') return body.logicBlock ?? null
  if (kind === 'sort_pack') return body.sortPack ?? null
  return body.plugin ?? null
}

/**
 * Ingress for global listing submissions from feed-builder VPS deployments.
 * Package payload is staged on the registry; fema.monster approves via moderation queue.
 */
export function registerGlobalRegistryIngressRoutes(app: Hono, pool: Pool | null): void {
  app.post('/api/global-marketplace/ingress/publish-requests', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global registry ingress only on canonical registry host' }, 503)
    }

    const body =
      (await c.req
        .json<{
          ownerDid?: string
          productKind?: unknown
          publisherNote?: string | null
          sourceHost?: string | null
          logicBlock?: LogicBlockPackage
          sortPack?: SortPackPackage
          plugin?: PluginPackage
        }>()
        .catch(() => null)) ?? {}

    const ownerDid = body.ownerDid?.trim()
    const productKind = parseProductKind(body.productKind)
    if (!ownerDid || !productKind) {
      return c.json({ error: 'ownerDid and productKind required' }, 400)
    }

    const pkg = resolvePackage(productKind, body)
    if (!pkg || pkg.id.trim() === '') {
      return c.json({ error: 'package payload required' }, 400)
    }

    const note =
      [body.publisherNote?.trim(), body.sourceHost ? `from ${body.sourceHost}` : null]
        .filter(Boolean)
        .join(' — ') || null

    try {
      const result = await ingestGlobalListingSubmission(pool, ownerDid, productKind, pkg, note)
      if (result === 'invalid_owner') return c.json({ error: 'owner mismatch' }, 400)
      if (result === 'duplicate') return c.json({ error: 'pending request already exists' }, 409)
      return c.json({ request: result }, 201)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ingress failed'
      return c.json({ error: message }, 400)
    }
  })
}
