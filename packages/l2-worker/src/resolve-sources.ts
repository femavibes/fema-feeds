import type { FeedConfig, NativeFeedSource, NormalizedPost } from '@cfb/core-types'
import type pg from 'pg'

/**
 * Resolve posts from one native source index for a feed.
 */
export async function resolveNativeSourcePosts(
  pool: pg.Pool,
  feed: FeedConfig,
  sourceIndex: number,
  limit: number = 1000,
): Promise<NormalizedPost[]> {
  const source = feed.sources?.native?.[sourceIndex]
  if (!source) return []
  return resolveOneSource(pool, source, feed.feedId, limit)
}

/**
 * Evaluate posts pulled from configured native sources (source-0, source-1, …).
 */
export async function processNativeSourcesForFeeds(
  pool: pg.Pool,
  feeds: FeedConfig[],
  matchedProjectIds: string[],
): Promise<{ evaluated: number; matched: number; written: number }> {
  const { processPostForFeeds } = await import('./process-post.js')
  let evaluated = 0
  let matched = 0
  let written = 0

  for (const feed of feeds) {
    if (!feed.enabled) continue
    const native = feed.sources?.native
    if (!native?.length) continue
    for (let i = 0; i < native.length; i++) {
      const nodeId = `source-${i}` as `source-${number}`
      const hasCanvasPath = (feed.visualLayout?.edges ?? []).some((e) => e.source === nodeId)
      if (!hasCanvasPath) continue
      const posts = await resolveNativeSourcePosts(pool, feed, i, 500)
      for (const post of posts) {
        const r = await processPostForFeeds(pool, post, matchedProjectIds, [feed], {
          ingress: nodeId,
        })
        evaluated += r.evaluated
        matched += r.matched
        written += r.written
      }
    }
  }

  return { evaluated, matched, written }
}

/**
 * Resolve posts from all configured native sources for a feed.
 * Returns normalized posts ready for L2 evaluation.
 */
export async function resolveSourcePosts(
  pool: pg.Pool,
  feed: FeedConfig,
  limit: number = 1000,
): Promise<NormalizedPost[]> {
  const sources = feed.sources?.native
  if (!sources?.length) return []

  const posts: NormalizedPost[] = []

  for (const source of sources) {
    const batch = await resolveOneSource(pool, source, feed.feedId, limit - posts.length)
    posts.push(...batch)
    if (posts.length >= limit) break
  }

  return posts
}

async function resolveOneSource(
  pool: pg.Pool,
  source: NativeFeedSource,
  currentFeedId: string,
  limit: number,
): Promise<NormalizedPost[]> {
  if (limit <= 0) return []

  switch (source.type) {
    case 'feed':
      return resolveFeedSource(pool, source.feedId, currentFeedId, limit)
    case 'project_pool':
      return resolveProjectPoolSource(pool, source.projectId, limit)
    case 'static_uri_list':
      return resolveStaticUriSource(pool, source.uris, limit)
  }
}

/**
 * Pull scored candidates from another feed.
 * Returns the posts (not the scores — they'll be re-scored by this feed's rules).
 */
async function resolveFeedSource(
  pool: pg.Pool,
  feedId: string,
  currentFeedId: string,
  limit: number,
): Promise<NormalizedPost[]> {
  if (feedId === currentFeedId) return [] // prevent self-reference

  const res = await pool.query<{ post_data: NormalizedPost }>(
    `SELECT p.post_data
     FROM feed_candidates fc
     JOIN ingested_posts p ON p.uri = fc.post_uri
     WHERE fc.feed_id = $1
       AND (fc.expires_at IS NULL OR fc.expires_at > NOW())
     ORDER BY fc.sort_key DESC, fc.post_indexed_at DESC NULLS LAST
     LIMIT $2`,
    [feedId, limit],
  )
  return res.rows.map((r) => r.post_data).filter(Boolean)
}

/**
 * Pull posts from another project's pool.
 */
async function resolveProjectPoolSource(
  pool: pg.Pool,
  projectId: string,
  limit: number,
): Promise<NormalizedPost[]> {
  const res = await pool.query<{ post_data: NormalizedPost }>(
    `SELECT post_data
     FROM ingested_posts
     WHERE project_id = $1
     ORDER BY indexed_at DESC
     LIMIT $2`,
    [projectId, limit],
  )
  return res.rows.map((r) => r.post_data).filter(Boolean)
}

/**
 * Load posts by URI from the database.
 */
async function resolveStaticUriSource(
  pool: pg.Pool,
  uris: string[],
  limit: number,
): Promise<NormalizedPost[]> {
  if (uris.length === 0) return []
  const subset = uris.slice(0, limit)
  const res = await pool.query<{ post_data: NormalizedPost }>(
    `SELECT post_data
     FROM ingested_posts
     WHERE uri = ANY($1)`,
    [subset],
  )
  return res.rows.map((r) => r.post_data).filter(Boolean)
}
