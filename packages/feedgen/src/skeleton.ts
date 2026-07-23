import type { FeedConfig, NativePersonalizationConfig, ProjectL1Config } from '@cfb/core-types'

import {
  isFeedPubliclyServed,
  PERSONALIZATION_DEPTH_DEFAULT,
  PERSONALIZATION_DEPTH_MAX,
} from '@cfb/core-types'

import type pg from 'pg'

import {
  getFeedSkeleton,
  getFeedCandidateWindow,
  loadServedPostsForViewer,
  loadViewerAffinityCounts,
  loadViewerLastFeedOpen,
  recordFeedServedPosts,
  recordViewerFeedOpen,
  incrementFeedImpression,
  resolveViewerFollowedDids,
  resolveViewerFollowerDids,
} from '@cfb/storage-postgres'

import { fetchActorFollowersDidsWithMeta, fetchActorFollowsDidsWithMeta } from '@cfb/viewer-graph'

import { resolveFeedByUri } from './uri.js'

import { applyFeedInjector } from './inject.js'

import { applyFeedRanker } from './rank.js'
import { applyNativePersonalization, type ViewerPersonalizationContext } from './native-personalization.js'

import { encodeFeedContext, newSkeletonReqId } from './feed-context.js'

import { applyViewerFollowRingFilter } from './skeleton-viewer-ring.js'
import { analyzePersonalizationNeeds } from './personalization-needs.js'

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

const viewerPersonalizationContextCache = new Map<
  string,
  { ctx: ViewerPersonalizationContext; expiresAt: number }
>()

function prunePersonalizationSessions(): void {
  const now = Date.now()
  for (const [key, session] of personalizationSessions) {
    if (session.expiresAt < now) personalizationSessions.delete(key)
  }
  for (const [key, entry] of viewerPersonalizationContextCache) {
    if (entry.expiresAt < now) viewerPersonalizationContextCache.delete(key)
  }
}

function viewerContextCacheKey(feedId: string, viewerDid: string): string {
  return `${feedId}::${viewerDid}`
}

const PERSONALIZED_CURSOR_PREFIX = 'p::'
const SERVE_GRAPH_RESOLVE_OPTS = { serveTime: true } as const

function serveFetchFollows(viewerDid: string, options?: { maxMs?: number }) {
  return fetchActorFollowsDidsWithMeta(viewerDid, options)
}

function serveFetchFollowers(viewerDid: string, options?: { maxMs?: number }) {
  return fetchActorFollowersDidsWithMeta(viewerDid, options)
}

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
  const needs = analyzePersonalizationNeeds(config)
  return needs.follows || needs.followers || needs.mutuals || needs.servedHistory || needs.affinity || needs.lastOpen ||
    Boolean(config.authorDiversity?.enabled)
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

async function refreshViewerServedPosts(
  pool: pg.Pool,
  ctx: ViewerPersonalizationContext,
  viewerDid: string,
  feedId: string,
  servedWindowHours: number,
): Promise<void> {
  const servedRows = await loadServedPostsForViewer(pool, viewerDid, feedId, servedWindowHours)
  ctx.servedPosts.clear()
  for (const sp of servedRows) {
    ctx.servedPosts.set(sp.postUri, {
      serveCount: sp.serveCount,
      servedAt: new Date(sp.servedAt),
      viewedAt: sp.viewedAt ? new Date(sp.viewedAt) : null,
    })
  }
}

async function loadViewerPersonalizationContext(
  pool: pg.Pool,
  feedId: string,
  viewerDid: string,
  personalization: NativePersonalizationConfig,
): Promise<ViewerPersonalizationContext> {
  const needs = analyzePersonalizationNeeds(personalization)
  const cacheKey = viewerContextCacheKey(feedId, viewerDid)
  const cached = viewerPersonalizationContextCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    if (needs.servedHistory) {
      await refreshViewerServedPosts(
        pool,
        cached.ctx,
        viewerDid,
        feedId,
        needs.servedWindowHours,
      )
    }
    return cached.ctx
  }
  const affinityWindowDays = personalization.affinityBoost?.windowDays ?? 30

  const [followedDids, servedRows, affinityCounts, lastOpen, viewerFollowers] = await Promise.all([
    needs.follows || needs.mutuals
      ? resolveViewerFollowedDids(pool, viewerDid, serveFetchFollows, SERVE_GRAPH_RESOLVE_OPTS)
      : Promise.resolve([] as string[]),
    needs.servedHistory
      ? loadServedPostsForViewer(pool, viewerDid, feedId, needs.servedWindowHours)
      : Promise.resolve([]),
    needs.affinity
      ? loadViewerAffinityCounts(pool, viewerDid, feedId, affinityWindowDays)
      : Promise.resolve(new Map()),
    needs.lastOpen
      ? loadViewerLastFeedOpen(pool, viewerDid, feedId)
      : Promise.resolve(null),
    needs.followers || needs.mutuals
      ? resolveViewerFollowerDids(pool, viewerDid, serveFetchFollowers, SERVE_GRAPH_RESOLVE_OPTS)
          .catch(() => [] as string[])
      : Promise.resolve([] as string[]),
  ])

  const followerDids = new Set(
    needs.followers || needs.mutuals ? viewerFollowers : [],
  )

  let mutualDids = new Set<string>()
  if (needs.mutuals) {
    const followedSet = new Set(followedDids)
    mutualDids = new Set(viewerFollowers.filter((did: string) => followedSet.has(did)))
  }

  void recordViewerFeedOpen(pool, viewerDid, feedId).catch(() => {})

  const hoursSinceLastOpen = lastOpen
    ? (Date.now() - lastOpen.getTime()) / (1000 * 60 * 60)
    : null

  const servedPosts = new Map<string, { serveCount: number; servedAt: Date; viewedAt: Date | null }>()
  for (const sp of servedRows) {
    servedPosts.set(sp.postUri, {
      serveCount: sp.serveCount,
      servedAt: new Date(sp.servedAt),
      viewedAt: sp.viewedAt ? new Date(sp.viewedAt) : null,
    })
  }

  const ctx: ViewerPersonalizationContext = {
    viewerDid,
    followedDids: new Set(followedDids),
    followerDids,
    mutualDids,
    servedPosts,
    affinityCounts,
    hoursSinceLastOpen,
  }

  viewerPersonalizationContextCache.set(cacheKey, {
    ctx,
    expiresAt: Date.now() + PERSONALIZATION_SESSION_TTL_MS,
  })

  return ctx
}

async function computePersonalizedUris(
  pool: pg.Pool,
  config: FeedConfig,
  project: ProjectL1Config | undefined,
  viewerDid: string,
  depth: number,
): Promise<string[]> {
  const personalization = config.personalization!

  const [window, viewerPerCtx] = await Promise.all([
    getFeedCandidateWindow(pool, config.feedId, depth),
    loadViewerPersonalizationContext(pool, config.feedId, viewerDid, personalization),
  ])

  const sortKeys = new Map(window.map((r) => [r.post, r.sortKey]))

  const filtered = await applyViewerFollowRingFilter(
    pool,
    config,
    project,
    window.map((r) => ({ post: r.post })),
    viewerDid,
  )

  const personalized = applyNativePersonalization(filtered, personalization, viewerPerCtx, sortKeys)
  return personalized.map((r) => r.post)
}

/**
 * Build (and cache) the personalized ordering for one viewer session:
 * fetch the full depth window of top candidates by sort order, filter,
 * personalize with base_score = real sort_key, and store the result.
 */
async function buildPersonalizationSession(
  pool: pg.Pool,
  config: FeedConfig,
  project: ProjectL1Config | undefined,
  viewerDid: string,
  limit: number,
  sessionId: string,
): Promise<PersonalizationSession> {
  const personalization = config.personalization!
  const depth = personalizationDepth(personalization, limit)
  const uris = await computePersonalizedUris(pool, config, project, viewerDid, depth)

  const session: PersonalizationSession = {
    feedId: config.feedId,
    viewerDid,
    uris,
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
    void recordFeedServedPosts(pool, {
      viewerDid: params.viewerDid,
      feedId: config.feedId,
      reqId,
      items: feed.map((row, position) => ({ postUri: row.post, position })),
    }).catch(() => {
      /* impression log failure must not break skeleton serve */
    })
  }

  // Record impression (all requests, including anonymous)
  void incrementFeedImpression(pool, config.feedId).catch(() => {})

  return { feed, cursor: nextCursor, reqId }
}
