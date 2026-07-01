import type { Hono } from 'hono'
import type { Pool } from '@cfb/storage-postgres'
import {
  globalMarketplaceRegistryRole,
  globalMarketplaceRemoteUrl,
  isCanonicalGlobalRegistryHost,
  deploymentPublicHostname,
} from './global-marketplace.js'

export interface GlobalCommunityFeedEntry {
  feedId: string
  name: string
  description?: string
  ownerDid?: string
  deploymentHost?: string
  allowAsInput?: boolean
  logicPublic?: boolean
  isTemplate?: boolean
  candidateCount?: number
  publishedAt?: string
  source?: 'deployment' | 'global'
}

/**
 * Public read API on the global registry host.
 * Consumer deployments call GET /api/global-community/feeds to get global public feeds.
 */
export function registerGlobalCommunityRoutes(app: Hono, pool: Pool | null): void {
  app.get('/api/global-community/feeds', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'global community registry not enabled on this host' }, 503)
    }
    try {
      const res = await pool.query<{
        feed_id: string
        name: string
        description: string | null
        owner_did: string | null
        deployment_host: string | null
        allow_as_input: boolean
        logic_public: boolean
        is_template: boolean
        candidate_count: number | null
        published_at: string | null
      }>(
        `SELECT feed_id, name, description, owner_did, deployment_host,
                allow_as_input, logic_public, is_template, candidate_count, published_at
         FROM community_feeds_global
         WHERE public = true
         ORDER BY published_at DESC NULLS LAST`,
      )
      const feeds: GlobalCommunityFeedEntry[] = res.rows.map((r) => ({
        feedId: r.feed_id,
        name: r.name,
        description: r.description ?? undefined,
        ownerDid: r.owner_did ?? undefined,
        deploymentHost: r.deployment_host ?? undefined,
        allowAsInput: r.allow_as_input,
        logicPublic: r.logic_public,
        isTemplate: r.is_template,
        candidateCount: r.candidate_count ?? undefined,
        publishedAt: r.published_at ?? undefined,
      }))
      return c.json({ feeds })
    } catch {
      return c.json({ feeds: [] })
    }
  })

  /** Consumer deployments POST here to register/update their public feeds on the global registry. */
  app.post('/api/global-community/feeds/sync', async (c) => {
    if (!pool) return c.json({ error: 'DATABASE_URL not configured' }, 503)
    if (!isCanonicalGlobalRegistryHost()) {
      return c.json({ error: 'not the global registry' }, 503)
    }
    const body = await c.req.json<{
      deploymentHost: string
      feeds: GlobalCommunityFeedEntry[]
    }>()
    if (!body.deploymentHost || !Array.isArray(body.feeds)) {
      return c.json({ error: 'deploymentHost and feeds[] required' }, 400)
    }
    // Upsert feeds from this deployment
    for (const f of body.feeds) {
      await pool.query(
        `INSERT INTO community_feeds_global
           (feed_id, name, description, owner_did, deployment_host, allow_as_input, logic_public, is_template, candidate_count, published_at, public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
         ON CONFLICT (feed_id, deployment_host) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           owner_did = EXCLUDED.owner_did,
           allow_as_input = EXCLUDED.allow_as_input,
           logic_public = EXCLUDED.logic_public,
           is_template = EXCLUDED.is_template,
           candidate_count = EXCLUDED.candidate_count,
           published_at = EXCLUDED.published_at,
           synced_at = NOW()`,
        [
          f.feedId,
          f.name,
          f.description ?? null,
          f.ownerDid ?? null,
          body.deploymentHost,
          f.allowAsInput ?? false,
          f.logicPublic ?? false,
          f.isTemplate ?? false,
          f.candidateCount ?? null,
          f.publishedAt ?? null,
        ],
      )
    }
    // Remove feeds from this deployment that are no longer public
    const feedIds = body.feeds.map((f) => f.feedId)
    if (feedIds.length > 0) {
      await pool.query(
        `DELETE FROM community_feeds_global
         WHERE deployment_host = $1 AND feed_id != ALL($2::text[])`,
        [body.deploymentHost, feedIds],
      )
    } else {
      await pool.query(
        `DELETE FROM community_feeds_global WHERE deployment_host = $1`,
        [body.deploymentHost],
      )
    }
    return c.json({ ok: true, synced: body.feeds.length })
  })
}

/** Fetch global community feeds from the canonical registry (consumer deployments). */
export async function fetchRemoteGlobalCommunityFeeds(): Promise<GlobalCommunityFeedEntry[]> {
  const url = globalMarketplaceRemoteUrl()
  if (!url) return []
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api/global-community/feeds`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return []
    const body = (await res.json()) as { feeds?: GlobalCommunityFeedEntry[] }
    return body.feeds ?? []
  } catch {
    return []
  }
}

/**
 * Push this deployment's public feeds to the global registry.
 * Fire-and-forget — logs errors to stderr.
 */
export function syncLocalFeedsToGlobalRegistry(
  localPublicFeeds: GlobalCommunityFeedEntry[],
): void {
  const role = globalMarketplaceRegistryRole()
  if (role !== 'consumer') return
  const url = globalMarketplaceRemoteUrl()
  if (!url) {
    console.error('[community-sync] no remote URL configured')
    return
  }
  const host = deploymentPublicHostname() || 'unknown-deployment'
  const endpoint = `${url.replace(/\/$/, '')}/api/global-community/feeds/sync`
  console.error(`[community-sync] syncing ${localPublicFeeds.length} feeds to ${endpoint} (host=${host})`)
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deploymentHost: host, feeds: localPublicFeeds }),
  })
    .then((res) => {
      if (!res.ok) console.error(`[community-sync] registry responded ${res.status}`)
      else console.error(`[community-sync] ok`)
    })
    .catch((err) => {
      console.error('[community-sync] fetch failed', err)
    })
}

export type CommunityFeedScope = 'all' | 'deployment' | 'global'

/**
 * Resolve community feeds based on scope.
 * - deployment: local feeds only
 * - global: remote registry feeds only (or own DB on registry host)
 * - all: merge both
 */
export async function resolveCommunityFeeds(
  localFeeds: GlobalCommunityFeedEntry[],
  scope: CommunityFeedScope,
  pool?: Pool | null,
): Promise<GlobalCommunityFeedEntry[]> {
  if (scope === 'deployment') return localFeeds

  if (globalMarketplaceRegistryRole() === 'registry') {
    // On the registry host, global feeds are in our own DB
    const dbFeeds = pool ? await loadGlobalFeedsFromDb(pool) : []
    if (scope === 'global') return dbFeeds
    // all: merge local disk feeds + DB feeds
    const seen = new Set(localFeeds.map((f) => f.feedId))
    const merged = [...localFeeds]
    for (const f of dbFeeds) {
      if (!seen.has(f.feedId)) merged.push(f)
    }
    return merged
  }

  // Consumer: fetch from remote registry
  const remote = (await fetchRemoteGlobalCommunityFeeds()).map((f) => ({ ...f, source: 'global' as const }))
  if (scope === 'global') return remote
  const seen = new Set(localFeeds.map((f) => f.feedId))
  const merged = [...localFeeds]
  for (const f of remote) {
    if (!seen.has(f.feedId)) merged.push(f)
  }
  return merged
}

async function loadGlobalFeedsFromDb(pool: Pool): Promise<GlobalCommunityFeedEntry[]> {
  const res = await pool.query<{
    feed_id: string
    name: string
    description: string | null
    owner_did: string | null
    deployment_host: string | null
    allow_as_input: boolean
    logic_public: boolean
    is_template: boolean
    candidate_count: number | null
    published_at: string | null
  }>(
    `SELECT feed_id, name, description, owner_did, deployment_host,
            allow_as_input, logic_public, is_template, candidate_count, published_at
     FROM community_feeds_global
     WHERE public = true
     ORDER BY published_at DESC NULLS LAST`,
  )
  return res.rows.map((r) => ({
    feedId: r.feed_id,
    name: r.name,
    description: r.description ?? undefined,
    ownerDid: r.owner_did ?? undefined,
    deploymentHost: r.deployment_host ?? undefined,
    allowAsInput: r.allow_as_input,
    logicPublic: r.logic_public,
    isTemplate: r.is_template,
    candidateCount: r.candidate_count ?? undefined,
    publishedAt: r.published_at ?? undefined,
    source: 'global' as const,
  }))
}
