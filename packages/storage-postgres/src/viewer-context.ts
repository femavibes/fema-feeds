import type { FeedInteractionEvent, ServedPostRecord, ViewerContext } from '@cfb/core-types'
import { bumpAudienceEngagement } from './feed-candidates.js'
import type pg from 'pg'

const FOLLOW_CACHE_TTL_HOURS = 6
const SERVE_GRAPH_BUDGET_MS = 800
const SERVED_HISTORY_DAYS = 7
const MAX_SERVED_ROWS = 500

export interface ViewerGraphResolveOptions {
  /** Serve-time path: prefer stale cache and cap live AppView graph latency. */
  serveTime?: boolean
}

type GraphFetchFn = (
  viewerDid: string,
  options?: { maxMs?: number },
) => Promise<string[] | { dids: string[]; partial?: boolean }>

interface CachedGraphRow {
  dids: string[]
  fresh: boolean
}

async function normalizeGraphFetch(
  result: string[] | { dids: string[]; partial?: boolean },
): Promise<{ dids: string[]; partial: boolean }> {
  if (Array.isArray(result)) return { dids: result, partial: false }
  return { dids: result.dids, partial: Boolean(result.partial) }
}

export async function getCachedViewerFollows(
  pool: pg.Pool | pg.PoolClient,
  viewerDid: string,
  options?: { allowStale?: boolean },
): Promise<CachedGraphRow | null> {
  const res = await pool.query<{ followed_dids: string[]; expires_at: Date }>(
    options?.allowStale
      ? `SELECT followed_dids, expires_at FROM viewer_follow_cache WHERE viewer_did = $1`
      : `SELECT followed_dids, expires_at FROM viewer_follow_cache
         WHERE viewer_did = $1 AND expires_at > NOW()`,
    [viewerDid],
  )
  const row = res.rows[0]
  if (!row) return null
  return { dids: row.followed_dids, fresh: row.expires_at > new Date() }
}

export async function saveViewerFollowCache(
  pool: pg.Pool | pg.PoolClient,
  viewerDid: string,
  followedDids: string[],
): Promise<void> {
  await pool.query(
    `INSERT INTO viewer_follow_cache (viewer_did, followed_dids, fetched_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + ($3::text || ' hours')::interval)
     ON CONFLICT (viewer_did) DO UPDATE SET
       followed_dids = EXCLUDED.followed_dids,
       fetched_at = NOW(),
       expires_at = EXCLUDED.expires_at`,
    [viewerDid, followedDids, String(FOLLOW_CACHE_TTL_HOURS)],
  )
}

export async function getCachedViewerFollowers(
  pool: pg.Pool | pg.PoolClient,
  viewerDid: string,
  options?: { allowStale?: boolean },
): Promise<CachedGraphRow | null> {
  const res = await pool.query<{ follower_dids: string[]; expires_at: Date }>(
    options?.allowStale
      ? `SELECT follower_dids, expires_at FROM viewer_follower_cache WHERE viewer_did = $1`
      : `SELECT follower_dids, expires_at FROM viewer_follower_cache
         WHERE viewer_did = $1 AND expires_at > NOW()`,
    [viewerDid],
  )
  const row = res.rows[0]
  if (!row) return null
  return { dids: row.follower_dids, fresh: row.expires_at > new Date() }
}

export async function saveViewerFollowerCache(
  pool: pg.Pool | pg.PoolClient,
  viewerDid: string,
  followerDids: string[],
): Promise<void> {
  await pool.query(
    `INSERT INTO viewer_follower_cache (viewer_did, follower_dids, fetched_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + ($3::text || ' hours')::interval)
     ON CONFLICT (viewer_did) DO UPDATE SET
       follower_dids = EXCLUDED.follower_dids,
       fetched_at = NOW(),
       expires_at = EXCLUDED.expires_at`,
    [viewerDid, followerDids, String(FOLLOW_CACHE_TTL_HOURS)],
  )
}

async function refreshViewerFollowersInBackground(
  pool: pg.Pool,
  viewerDid: string,
  fetchFollowers: GraphFetchFn,
): Promise<void> {
  try {
    const { dids: followers } = await normalizeGraphFetch(await fetchFollowers(viewerDid))
    await saveViewerFollowerCache(pool, viewerDid, followers)
  } catch {
    /* background refresh must not throw */
  }
}

async function refreshViewerFollowsInBackground(
  pool: pg.Pool,
  viewerDid: string,
  fetchFollows: GraphFetchFn,
): Promise<void> {
  try {
    const { dids: followed } = await normalizeGraphFetch(await fetchFollows(viewerDid))
    await saveViewerFollowCache(pool, viewerDid, followed)
  } catch {
    /* background refresh must not throw */
  }
}

export async function resolveViewerFollowerDids(
  pool: pg.Pool,
  viewerDid: string,
  fetchFollowers: GraphFetchFn,
  options?: ViewerGraphResolveOptions,
): Promise<string[]> {
  const cached = await getCachedViewerFollowers(pool, viewerDid, { allowStale: options?.serveTime })
  if (cached?.fresh) return cached.dids
  if (cached && options?.serveTime) {
    void refreshViewerFollowersInBackground(pool, viewerDid, fetchFollowers)
    return cached.dids
  }

  try {
    const fetchOpts = options?.serveTime ? { maxMs: SERVE_GRAPH_BUDGET_MS } : undefined
    const { dids: followers, partial } = await normalizeGraphFetch(
      await fetchFollowers(viewerDid, fetchOpts),
    )
    await saveViewerFollowerCache(pool, viewerDid, followers)
    if (options?.serveTime && partial) {
      void refreshViewerFollowersInBackground(pool, viewerDid, fetchFollowers)
    }
    return followers
  } catch {
    return cached?.dids ?? []
  }
}

export async function resolveViewerFollowedDids(
  pool: pg.Pool,
  viewerDid: string,
  fetchFollows: GraphFetchFn,
  options?: ViewerGraphResolveOptions,
): Promise<string[]> {
  const cached = await getCachedViewerFollows(pool, viewerDid, { allowStale: options?.serveTime })
  if (cached?.fresh) return cached.dids
  if (cached && options?.serveTime) {
    void refreshViewerFollowsInBackground(pool, viewerDid, fetchFollows)
    return cached.dids
  }

  try {
    const fetchOpts = options?.serveTime ? { maxMs: SERVE_GRAPH_BUDGET_MS } : undefined
    const { dids: followed, partial } = await normalizeGraphFetch(
      await fetchFollows(viewerDid, fetchOpts),
    )
    await saveViewerFollowCache(pool, viewerDid, followed)
    if (options?.serveTime && partial) {
      void refreshViewerFollowsInBackground(pool, viewerDid, fetchFollows)
    }
    return followed
  } catch {
    return cached?.dids ?? []
  }
}

export async function loadServedPostsForViewer(
  pool: pg.Pool,
  viewerDid: string,
  feedId: string,
  servedWindowHours?: number,
): Promise<ServedPostRecord[]> {
  const useHours = servedWindowHours != null
  const windowParam = useHours
    ? String(Math.max(1, Math.floor(servedWindowHours)))
    : String(SERVED_HISTORY_DAYS)
  const windowUnit = useHours ? 'hours' : 'days'

  const res = await pool.query<{
    post_uri: string
    served_at: Date
    impression_count: number
    seen_at: Date | null
  }>(
    `SELECT post_uri, served_at, impression_count, seen_at
     FROM feed_served_posts
     WHERE viewer_did = $1 AND feed_id = $2
       AND served_at >= NOW() - ($3::text || ' ${windowUnit}')::interval
     ORDER BY served_at DESC
     LIMIT $4`,
    [viewerDid, feedId, windowParam, MAX_SERVED_ROWS],
  )

  return res.rows.map((r) => ({
    postUri: r.post_uri,
    servedAt: new Date(r.served_at).toISOString(),
    serveCount: Number(r.impression_count),
    viewedAt: r.seen_at ? new Date(r.seen_at).toISOString() : null,
  }))
}

export async function loadViewerInteractionUris(
  pool: pg.Pool,
  viewerDid: string,
  event: 'interactionLike' | 'interactionRepost',
): Promise<string[]> {
  const res = await pool.query<{ post_uri: string }>(
    `SELECT post_uri FROM viewer_post_interactions
     WHERE viewer_did = $1 AND event = $2
     ORDER BY occurred_at DESC
     LIMIT 1000`,
    [viewerDid, event],
  )
  return res.rows.map((r) => r.post_uri)
}

/**
 * Per-author affinity breakdown for personalization.
 */
export interface AuthorAffinityRecord {
  total: number
  likes: number
  reposts: number
  replies: number
  quotes: number
  lastAt: Date
}

/**
 * Load per-author interaction counts for the viewer, scoped to a specific feed.
 * Returns a map of authorDid → breakdown by event type.
 * Only considers interactions within the given window.
 */
export async function loadViewerAffinityCounts(
  pool: pg.Pool,
  viewerDid: string,
  feedId: string,
  windowDays: number = 30,
): Promise<Map<string, AuthorAffinityRecord>> {
  const res = await pool.query<{
    author_did: string
    event: string
    cnt: string
    last_at: Date
  }>(
    `SELECT
       split_part(post_uri, '/', 3) AS author_did,
       event,
       COUNT(*)::text AS cnt,
       MAX(occurred_at) AS last_at
     FROM viewer_post_interactions
     WHERE viewer_did = $1
       AND feed_id = $2
       AND occurred_at >= NOW() - ($3::text || ' days')::interval
     GROUP BY split_part(post_uri, '/', 3), event
     ORDER BY cnt DESC
     LIMIT 2000`,
    [viewerDid, feedId, String(windowDays)],
  )

  const map = new Map<string, AuthorAffinityRecord>()
  for (const row of res.rows) {
    const existing = map.get(row.author_did) ?? { total: 0, likes: 0, reposts: 0, replies: 0, quotes: 0, lastAt: new Date(0) }
    const count = parseInt(row.cnt, 10)
    existing.total += count
    if (row.event === 'interactionLike') existing.likes += count
    else if (row.event === 'interactionRepost') existing.reposts += count
    else if (row.event === 'interactionReply') existing.replies += count
    else if (row.event === 'interactionQuote') existing.quotes += count
    const rowDate = new Date(row.last_at)
    if (rowDate > existing.lastAt) existing.lastAt = rowDate
    map.set(row.author_did, existing)
  }
  return map
}

/**
 * Load the last time this viewer requested this feed's skeleton.
 * Returns null if never recorded.
 */
export async function loadViewerLastFeedOpen(
  pool: pg.Pool,
  viewerDid: string,
  feedId: string,
): Promise<Date | null> {
  const res = await pool.query<{ last_open_at: Date }>(
    `SELECT last_open_at FROM viewer_feed_opens
     WHERE viewer_did = $1 AND feed_id = $2`,
    [viewerDid, feedId],
  )
  return res.rows[0]?.last_open_at ? new Date(res.rows[0].last_open_at) : null
}

/**
 * Record that the viewer just opened this feed (upsert).
 */
export async function recordViewerFeedOpen(
  pool: pg.Pool,
  viewerDid: string,
  feedId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO viewer_feed_opens (viewer_did, feed_id, last_open_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (viewer_did, feed_id) DO UPDATE SET
       last_open_at = NOW()`,
    [viewerDid, feedId],
  )
}

export async function loadViewerContext(
  pool: pg.Pool,
  input: {
    viewerDid: string
    feedId: string
    candidateAuthorDids: string[]
    fetchFollows: (viewerDid: string) => Promise<string[]>
    /** When set, limits served-post history to this many hours (personalization window). */
    servedWindowHours?: number
    /** Ranker uses liked/reposted URIs; personalization does not. */
    includeInteractionUris?: boolean
  },
): Promise<ViewerContext> {
  const includeInteractions = input.includeInteractionUris !== false
  const [followedDids, servedPosts, likedPostUris, repostedPostUris] = await Promise.all([
    resolveViewerFollowedDids(pool, input.viewerDid, input.fetchFollows),
    loadServedPostsForViewer(pool, input.viewerDid, input.feedId, input.servedWindowHours),
    includeInteractions
      ? loadViewerInteractionUris(pool, input.viewerDid, 'interactionLike')
      : Promise.resolve([]),
    includeInteractions
      ? loadViewerInteractionUris(pool, input.viewerDid, 'interactionRepost')
      : Promise.resolve([]),
  ])

  const authorSet = new Set(input.candidateAuthorDids)
  const followedAuthorDids =
    authorSet.size > 0
      ? followedDids.filter((did) => authorSet.has(did))
      : followedDids

  return {
    viewerDid: input.viewerDid,
    followedAuthorDids,
    servedPosts,
    likedPostUris,
    repostedPostUris,
  }
}

export interface ServedFeedItem {
  postUri: string
  position: number
}

export async function recordFeedServedPosts(
  pool: pg.Pool,
  input: {
    viewerDid: string
    feedId: string
    reqId: string
    items: ServedFeedItem[]
  },
): Promise<void> {
  if (input.items.length === 0) return

  const postUris = input.items.map((item) => item.postUri)
  const positions = input.items.map((item) => item.position)

  await pool.query(
    `INSERT INTO feed_served_posts
       (viewer_did, feed_id, post_uri, req_id, position, served_at, impression_count)
     SELECT $1, $2, u.post_uri, $3, u.position, NOW(), 1
     FROM unnest($4::text[], $5::int[]) AS u(post_uri, position)
     ON CONFLICT (viewer_did, feed_id, post_uri) DO UPDATE SET
       req_id = EXCLUDED.req_id,
       position = EXCLUDED.position,
       served_at = NOW(),
       impression_count = feed_served_posts.impression_count + 1`,
    [input.viewerDid, input.feedId, input.reqId, postUris, positions],
  )
}

export interface FeedInteractionInput {
  postUri: string
  event: FeedInteractionEvent
  feedId?: string
  reqId?: string
}

export async function applyFeedInteractionEvents(
  pool: pg.Pool,
  viewerDid: string,
  interactions: FeedInteractionInput[],
): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.event === 'interactionSeen') {
      // Client-confirmed view (interactionSeen) — distinct from skeleton serve count.
      await pool.query(
        `UPDATE feed_served_posts SET seen_at = COALESCE(seen_at, NOW())
         WHERE viewer_did = $1 AND post_uri = $2
           AND ($3::text IS NULL OR feed_id = $3)`,
        [viewerDid, interaction.postUri, interaction.feedId ?? null],
      )
      continue
    }

    await pool.query(
      `INSERT INTO viewer_post_interactions (viewer_did, post_uri, event, feed_id, req_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (viewer_did, post_uri, event) DO UPDATE SET
         feed_id = COALESCE(EXCLUDED.feed_id, viewer_post_interactions.feed_id),
         req_id = COALESCE(EXCLUDED.req_id, viewer_post_interactions.req_id),
         occurred_at = NOW()`,
      [
        viewerDid,
        interaction.postUri,
        interaction.event,
        interaction.feedId ?? null,
        interaction.reqId ?? null,
      ],
    )

    // Bump audience engagement on the candidate so sort_key stays live
    if (interaction.feedId) {
      if (interaction.event === 'interactionLike') {
        await bumpAudienceEngagement(pool, interaction.feedId, interaction.postUri, 'like')
      } else if (interaction.event === 'interactionRepost') {
        await bumpAudienceEngagement(pool, interaction.feedId, interaction.postUri, 'repost')
      }
    }
  }
}
