import type { Hono } from 'hono'
import {
  buildDidWebDocument,
  handleDescribeFeedGenerator,
  handleGetFeedSkeleton,
  handleSendFeedInteractions,
  parseViewerDidFromAuthorization,
  resolveFeedByUri,
  resolveFeedgenServiceDid,
} from '@cfb/feedgen'
import type { Pool } from '@cfb/storage-postgres'
import { countFeedCandidates } from '@cfb/storage-postgres'
import { loadProject } from '@cfb/project-config'
import { buildFeedgenSkeletonErrorHtml, wantsFeedSkeletonHtml } from './feedgen-html.js'
import { buildSkeletonPreviewHtml } from './skeleton-preview-html.js'
import { loadTenantFeeds, resolveFeedgenTenant } from './feedgen-tenant.js'

export interface FeedgenRouteOptions {
  feedsDir: string
  projectsDir: string
  pool: Pool | null
}

export function registerFeedgenRoutes(app: Hono, options: FeedgenRouteOptions): void {
  const { feedsDir, projectsDir, pool } = options

  app.get('/.well-known/did.json', async (c) => {
    const host = c.req.header('host')
    const tenant = await resolveFeedgenTenant(pool, { host })
    const doc = buildDidWebDocument(tenant.settings.publicBaseUrl)
    if (!doc) {
      return c.json({ error: 'Feed generator DID document not configured for this host' }, 404)
    }
    return c.json(doc)
  })

  app.get('/xrpc/app.bsky.feed.getFeedSkeleton', async (c) => {
    if (!pool) return c.json({ error: 'DatabaseNotConfigured' }, 503)
    const feed = c.req.query('feed')
    if (!feed) return c.json({ error: 'feed parameter required' }, 400)

    const host = c.req.header('host')
    const tenant = await resolveFeedgenTenant(pool, { host, feedUri: feed })
    const feeds = await loadTenantFeeds(feedsDir, tenant.ownerDid)
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
    const cursor = c.req.query('cursor') ?? undefined
    const viewerDid = parseViewerDidFromAuthorization(c.req.header('authorization'))
    const htmlMode = wantsFeedSkeletonHtml(c)

    let project
    const feedConfig = resolveFeedByUri(feeds, tenant.ownerDid, feed)
    if (feedConfig?.projectId) {
      try {
        project = await loadProject(projectsDir, feedConfig.projectId)
      } catch {
        project = undefined
      }
    }

    const result = await handleGetFeedSkeleton(pool, feeds, tenant.ownerDid, {
      feed,
      limit,
      cursor,
      viewerDid,
      project,
    })

    if ('error' in result) {
      if (htmlMode) {
        return c.html(buildFeedgenSkeletonErrorHtml(result.error, result.status), result.status as 400 | 503)
      }
      return c.json({ message: result.error }, result.status as 400 | 503)
    }

    if (htmlMode) {
      const config = feedConfig
      const candidateCount = config ? await countFeedCandidates(pool, config.feedId) : 0
      const jsonUrl = new URL(c.req.url)
      jsonUrl.searchParams.delete('format')
      jsonUrl.searchParams.set('format', 'json')
      const html = buildSkeletonPreviewHtml({
        feedName: config?.name ?? feed,
        feedId: config?.feedId ?? feed,
        candidateCount,
        items: result.feed,
        cursor: result.cursor,
        publicSkeletonUrl: jsonUrl.toString(),
      })
      return c.html(html)
    }

    return c.json(result)
  })

  app.post('/xrpc/app.bsky.feed.sendInteractions', async (c) => {
    if (!pool) return c.json({ error: 'DatabaseNotConfigured' }, 503)
    const viewerDid = parseViewerDidFromAuthorization(c.req.header('authorization'))
    let body: { feed?: string; interactions?: unknown[] }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const result = await handleSendFeedInteractions(pool, viewerDid, {
      feed: typeof body.feed === 'string' ? body.feed : undefined,
      interactions: Array.isArray(body.interactions)
        ? (body.interactions as Array<{
            item?: string
            event?: string
            feedContext?: string
            reqId?: string
          }>)
        : [],
    })

    if ('error' in result) {
      return c.json({ message: result.error }, result.status as 400)
    }
    return c.json({})
  })

  app.get('/xrpc/app.bsky.feed.describeFeedGenerator', async (c) => {
    const host = c.req.header('host')
    const tenant = await resolveFeedgenTenant(pool, { host })
    const feeds = await loadTenantFeeds(feedsDir, tenant.ownerDid)
    const serviceDid = resolveFeedgenServiceDid(tenant.settings, tenant.ownerDid)
    const result = handleDescribeFeedGenerator(feeds, serviceDid, {
      publisherDid: tenant.ownerDid,
      privacyPolicy: tenant.settings.privacyPolicyUrl,
      termsOfService: tenant.settings.termsOfServiceUrl,
    })

    if ('error' in result) {
      return c.json({ message: result.error }, result.status as 503)
    }
    return c.json(result)
  })
}