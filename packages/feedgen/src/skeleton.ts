import type { FeedConfig, NativePersonalizationConfig, ProjectL1Config } from '@cfb/core-types'

import { isFeedPubliclyServed, PERSONALIZATION_DEPTH_DEFAULT, PERSONALIZATION_DEPTH_MAX } from '@cfb/core-types'

import type pg from 'pg'

import { getFeedSkeleton, getFeedCandidateWindow, recordFeedServedPosts, incrementFeedImpression } from '@cfb/storage-postgres'

import { resolveFeedByUri } from './uri.js'

import { applyFeedInjector } from './inject.js'

import { applyFeedRanker } from './rank.js'
import { applyNativePersonalization, type ViewerPersonalizationContext } from './native-personalization.js'

import { encodeFeedContext, newSkeletonReqId } from './feed-context.js'

import { applyViewerFollowRingFilter } from './skeleton-viewer-ring.js'

export interface SkeletonFeedItem {
  post: string
  /** When the candidate was a reshare record, emit subject post + reasonRepost for clients. */
  reason?: {
    $type: 'app.bsky.feed.defs#reasonRepost'
    by: string
    indexedAt: string
  }
  feedContext?: string
}

export interface SkeletonResponse {
  feed: SkeletonFeedItem[]
  cursor?: string
  reqId?: string
}

export interface SkeletonError {
  error: string
  status: number
}

export interface SkeletonRequestOptions {
  feed: string
  limit?: number
  cursor?: string
  viewerDid?: string
  /** L1 project config for viewer follow-ring at skeleton serve. */
  project?: ProjectL1Config
}

// --- Personalization sessions ------------------------------------------------
// Personalization reorders a deep window of candidates (not just one page), so
// pagination can't use sort_key cursors — the personalized order isn't sorted
// by sort_key. Instead the full personalized ordering is cached per viewer
// session and the cursor is "p::<sessionId>::<offset>".

interface PersonalizationSession {
  feedId: string
  viewerDid: string
  uris: string[]
  expiresAt: number
}

const PERSONALIZATION_SESSION_TTL_MS = 10 * 60 * 1000
const personalizationSessions = new Map<string, PersonalizationSession>()

function prunePersonalizationSessions(): void {
  const now = Date.now()
  for (const [key, session] of personalizationSessions) {
    if (session.expiresAt < now) personalizationSessions.delete(key)
  }
}

const PERSONALIZED_CURSOR_PREFIX = 'p::'

function parsePersonalizedCursor(cursor: string): { sessionId: string; offset: number } | null {
  if (!cursor.startsWith(PERSONALIZED_CURSOR_PREFIX)) return null
  const rest = cursor.slice(PERSONALIZED_CURSOR_PREFIX.length)
  const sep = rest.lastIndexOf('::')
  if (sep < 0) return null
  const sessionId = rest.slice(0, sep)
  const offset = Number(rest.slice(sep + 2))
  if (!sessionId || !Number.isFinite(offset) || offset < 0) return null
  return { sessionId, offset: Math.floor(offset) }
}

function personalizationActive(config: NativePersonalizationConfig | undefined): boolean {
  if (!config) return false
  if (config.formulaEnabled && config.formula) return true
  return Boolean(
    config.boostFollowed?.enabled ||
    config.boostMutuals?.enabled ||
    config.suppressSeen?.enabled ||
    config.authorDiversity?.enabled ||
    config.affinityBoost?.enabled,
  )
}

function personalizationDepth(config: NativePersonalizationConfig, limit: number): number {
  const depth = config.depth ?? PERSONALIZATION_DEPTH_DEFAULT
  return Math.max(limit, Math.min(depth, PERSONALIZATION_DEPTH_MAX))
}

/** Map stored repost URIs → subject post + reasonRepost for AppView hydration. */
async function expandRepostSkeletonItems(
  pool: pg.Pool,
  rows: { post: string }[],
): Promise<SkeletonFeedItem[]> {
  const repostUris = rows
    .map((r) => r.post)
    .filter((uri) => uri.includes('/app.bsky.feed.repost/'))
  if (repostUris.length === 0) {
    return rows.map((r) => ({ post: r.post }))
  }

  const res = await pool.query<{
    post_uri: string
    author_did: string
    indexed_at: Date
    summary_json: {
      postKind?: string
      repost?: { subjectUri?: string }
    }
  }>(
    `SELECT post_uri, author_did, indexed_at, summary_json
     FROM ingested_posts WHERE post_uri = ANY($1::text[])`,
    [repostUris],
  )
  const byUri = new Map(res.rows.map((r) => [r.post_uri, r]))

  return rows.map((row) => {
    const meta = byUri.get(row.post)
    const subject = meta?.summary_json?.repost?.subjectUri
    if (meta?.summary_json?.postKind === 'repost' && subject) {
      return {
        post: subject,
        reason: {
          $type: 'app.bsky.feed.defs#reasonRepost' as const,
          by: meta.author_did,
          indexedAt: new Date(meta.indexed_at).toISOString(),
        },
      }
    }
    return { post: row.post }
  })
}

function personalizationServedWindowHours(
  config: NativePersonalizationConfig | undefined,
): number {
  return Math.max(1, config?.suppressSeen?.windowHours ?? 48)
}

async function loadViewerPersonalizationContext(
  pool: pg.Pool,
  feedId: string,
  viewerDid: string,
  candidateAuthorDids: string[],
  personalization: NativePersonalizationConfig | undefined,
): Promise<ViewerPersonalizationContext> {
  const {
    loadViewerContext,
    loadViewerAffinityCounts,
    loadViewerLastFeedOpen,
    recordViewerFeedOpen,
  } = await import('@cfb/storage-postgres')
  const { fetchViewerFollowedDids, fetchActorFollowersDids } = await import('@cfb/viewer-graph')

  const viewerCtx = await loadViewerContext(pool, {
    viewerDid,
    feedId,
    candidateAuthorDids,
    fetchFollows: fetchViewerFollowedDids,
    servedWindowHours: personalizationServedWindowHours(personalization),
  })

  // Resolve mutuals: intersection of viewer's follows and viewer's followers
  let mutualDids = new Set<string>()
  try {
    const viewerFollowers = await fetchActorFollowersDids(viewerDid)
    const followedSet = new Set(viewerCtx.followedAuthorDids)
    mutualDids = new Set(viewerFollowers.filter((did) => followedSet.has(did)))
  } catch { /* follower fetch may fail — degrade gracefully */ }

  // Load feed-scoped affinity (per-author interaction breakdown)
  const affinityCounts = await loadViewerAffinityCounts(pool, viewerDid, feedId, 30)

  // Load hours since last open
  const lastOpen = await loadViewerLastFeedOpen(pool, viewerDid, feedId)
  const hoursSinceLastOpen = lastOpen
    ? (Date.now() - lastOpen.getTime()) / (1000 * 60 * 60)
    : null

  // Record this open (fire and forget)
  void recordViewerFeedOpen(pool, viewerDid, feedId).catch(() => {})

  // Build seen posts map with impression count + served time
  const seenPosts = new Map<string, { impressionCount: number; servedAt: Date }>()
  for (const sp of viewerCtx.servedPosts) {
    seenPosts.set(sp.postUri, {
      impressionCount: sp.impressionCount,
      servedAt: new Date(sp.servedAt),
    })
  }

  return {
    viewerDid,
    followedDids: new Set(viewerCtx.followedAuthorDids),
    mutualDids,
    seenPosts,
    affinityCounts,
    hoursSinceLastOpen,
  }
}

/**
 * Build (and cache) the personalized ordering for one viewer session:
 * fetch a deep window of top candidates by sort order, filter, personalize
 * the whole window with base_score = real sort_key, and store the result.
 */
async function buildPersonalizationSession(
  pool: pg.Pool,
  config: FeedConfig,
  project: ProjectL1Config | undefined,
  viewerDid: string,
  limit: number,
  sessionId: string,
): Promise<PersonalizationSession> {
  const depth = personalizationDepth(config.personalization!, limit)
  const window = await getFeedCandidateWindow(pool, config.feedId, depth)
  const sortKeys = new Map(window.map((r) => [r.post, r.sortKey]))

  const filtered = await applyViewerFollowRingFilter(
    pool,
    config,
    project,
    window.map((r) => ({ post: r.post })),
    viewerDid,
  )

  const authorDids = [...new Set(
    filtered.map((r) => r.post.match(/^at:\/\/([^/]+)\//)?.[1]).filter(Boolean),
  )] as string[]

  const viewerPerCtx = await loadViewerPersonalizationContext(
    pool, config.feedId, viewerDid, authorDids, config.personalization,
  )

  const personalized = applyNativePersonalization(filtered, config.personalization, viewerPerCtx, sortKeys)

  const session: PersonalizationSession = {
    feedId: config.feedId,
    viewerDid,
    uris: personalized.map((r) => r.post),
    expiresAt: Date.now() + PERSONALIZATION_SESSION_TTL_MS,
  }
  prunePersonalizationSessions()
  personalizationSessions.set(sessionId, session)
  return session
}

export async function handleGetFeedSkeleton(
  pool: pg.Pool,
  feeds: FeedConfig[],
  publisherDid: string,
  params: SkeletonRequestOptions,
): Promise<SkeletonResponse | SkeletonError> {
  if (!publisherDid) {
    return { error: 'Feed publisher DID not configured', status: 503 }
  }

  const config = resolveFeedByUri(feeds, publisherDid, params.feed)
  if (!config) {
    return { error: 'Unknown feed', status: 400 }
  }
  if (!isFeedPubliclyServed(config)) {
    return { feed: [] }
  }

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100)

  const personalize = Boolean(
    params.viewerDid && personalizationActive(config.personalization),
  )

  let pageRows: { post: string }[]
  let nextCursor: string | undefined

  if (personalize) {
    const parsed = params.cursor ? parsePersonalizedCursor(params.cursor) : null
    const sessionId = parsed?.sessionId ?? newSkeletonReqId()
    const offset = parsed?.offset ?? 0

    let session = personalizationSessions.get(sessionId)
    if (
      !session ||
      session.feedId !== config.feedId ||
      session.viewerDid !== params.viewerDid ||
      session.expiresAt < Date.now()
    ) {
      session = await buildPersonalizationSession(
        pool, config, params.project, params.viewerDid!, limit, sessionId,
      )
    }

    pageRows = session.uris.slice(offset, offset + limit).map((post) => ({ post }))
    nextCursor = offset + limit < session.uris.length
      ? `${PERSONALIZED_CURSOR_PREFIX}${sessionId}::${offset + limit}`
      : undefined
  } else {
    const skeleton = await getFeedSkeleton(pool, config.feedId, limit, params.cursor)
    pageRows = await applyViewerFollowRingFilter(
      pool,
      config,
      params.project,
      skeleton.feed,
      params.viewerDid,
    )
    nextCursor = skeleton.cursor
  }

  const ranked = await applyFeedRanker(pool, config, pageRows, limit, params.viewerDid)

  const feedRows = await applyFeedInjector(pool, config, ranked, limit, params.viewerDid)

  const expanded = await expandRepostSkeletonItems(pool, feedRows)

  const reqId = params.viewerDid ? newSkeletonReqId() : undefined

  const feed: SkeletonFeedItem[] = expanded.map((row, index) => ({
    ...row,
    ...(reqId
      ? { feedContext: encodeFeedContext(config.feedId, reqId, index) }
      : {}),
  }))

  if (params.viewerDid && reqId) {
    try {
      await recordFeedServedPosts(pool, {
        viewerDid: params.viewerDid,
        feedId: config.feedId,
        reqId,
        items: feed.map((row, position) => ({ postUri: row.post, position })),
      })
    } catch {
      /* impression log failure must not break skeleton serve */
    }
  }

  // Record impression (all requests, including anonymous)
  void incrementFeedImpression(pool, config.feedId).catch(() => {})

  return { feed, cursor: nextCursor, reqId }
}
