import type { PostMetrics } from '@cfb/core-types'
import type pg from 'pg'
import { getAuthorProfile, getPostEngagement } from '@cfb/storage-postgres'

export async function loadPostMetrics(
  pool: pg.Pool,
  postUri: string,
  authorDid: string,
  feedId?: string,
): Promise<PostMetrics> {
  const [engagement, profile] = await Promise.all([
    getPostEngagement(pool, postUri),
    getAuthorProfile(pool, authorDid),
  ])

  let audienceLikes = 0
  let audienceReposts = 0
  if (feedId) {
    try {
      const res = await pool.query<{ audience_likes: string; audience_reposts: string }>(
        `SELECT audience_likes, audience_reposts FROM feed_candidates WHERE feed_id = $1 AND post_uri = $2`,
        [feedId, postUri],
      )
      if (res.rows[0]) {
        audienceLikes = Number(res.rows[0].audience_likes)
        audienceReposts = Number(res.rows[0].audience_reposts)
      }
    } catch {
      // Older DBs may lack audience_* columns — treat as zero (migration 040).
    }
  }

  return {
    likeCount: engagement?.likeCount ?? 0,
    repostCount: engagement?.repostCount ?? 0,
    replyCount: engagement?.replyCount ?? 0,
    quoteCount: engagement?.quoteCount ?? 0,
    bookmarkCount: engagement?.bookmarkCount ?? 0,
    authorFollowerCount: profile?.followersCount ?? 0,
    authorFollowsCount: profile?.followsCount ?? 0,
    authorPostsCount: profile?.postsCount ?? 0,
    audienceLikes,
    audienceReposts,
  }
}
