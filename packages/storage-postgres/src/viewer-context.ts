import type { FeedInteractionEvent, ServedPostRecord, ViewerContext } from '@cfb/core-types'
import type pg from 'pg'

const FOLLOW_CACHE_TTL_HOURS = 6
const SERVED_HISTORY_DAYS = 7
const MAX_SERVED_ROWS = 500

export async function getCachedViewerFollows(
  pool: pg.Pool | pg.PoolClient,
  viewerDid: string,
): Promise<string[] | null> {
  const res = await pool.query<{ followed_dids: string[] }>(
    `SELECT followed_dids FROM viewer_follow_cache
     WHERE viewer_did = $1 AND expires_at > NOW()`,
    [viewerDid],
  )
  return res.rows[0]?.followed_dids ?? null
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

export async function resolveViewerFollowedDids(
  pool: pg.Pool,
  viewerDid: string,
  fetchFollows: (viewerDid: string) => Promise<string[]>,
): Promise<string[]> {
  const cached = await getCachedViewerFollows(pool, viewerDid)
  if (cached) return cached

  try {
    const followed = await fetchFollows(viewerDid)
    await saveViewerFollowCache(pool, viewerDid, followed)
    return followed
  } catch {
    return []
  }
}

export async function loadServedPostsForViewer(
  pool: pg.Pool,
  viewerDid: string,
  feedId: string,
): Promise<ServedPostRecord[]> {
  const res = await pool.query<{
    post_uri: string
    served_at: Date
    impression_count: number
    seen_at: Date | null
  }>(
    `SELECT post_uri, served_at, impression_count, seen_at
     FROM feed_served_posts
     WHERE viewer_did = $1 AND feed_id = $2
       AND served_at >= NOW() - ($3::text || ' days')::interval
     ORDER BY served_at DESC
     LIMIT $4`,
    [viewerDid, feedId, String(SERVED_HISTORY_DAYS), MAX_SERVED_ROWS],
  )

  return res.rows.map((r) => ({
    postUri: r.post_uri,
    servedAt: new Date(r.served_at).toISOString(),
    impressionCount: Number(r.impression_count),
    seenConfirmed: r.seen_at != null,
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

export async function loadViewerContext(
  pool: pg.Pool,
  input: {
    viewerDid: string
    feedId: string
    candidateAuthorDids: string[]
    fetchFollows: (viewerDid: string) => Promise<string[]>
  },
): Promise<ViewerContext> {
  const [followedDids, servedPosts, likedPostUris, repostedPostUris] = await Promise.all([
    resolveViewerFollowedDids(pool, input.viewerDid, input.fetchFollows),
    loadServedPostsForViewer(pool, input.viewerDid, input.feedId),
    loadViewerInteractionUris(pool, input.viewerDid, 'interactionLike'),
    loadViewerInteractionUris(pool, input.viewerDid, 'interactionRepost'),
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

  for (const item of input.items) {
    await pool.query(
      `INSERT INTO feed_served_posts
         (viewer_did, feed_id, post_uri, req_id, position, served_at, impression_count)
       VALUES ($1, $2, $3, $4, $5, NOW(), 1)
       ON CONFLICT (viewer_did, feed_id, post_uri) DO UPDATE SET
         req_id = EXCLUDED.req_id,
         position = EXCLUDED.position,
         served_at = NOW(),
         impression_count = feed_served_posts.impression_count + 1`,
      [input.viewerDid, input.feedId, item.postUri, input.reqId, item.position],
    )
  }
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
  }
}
