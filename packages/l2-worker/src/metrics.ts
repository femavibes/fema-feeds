import type { PostMetrics } from '@cfb/core-types'
import type pg from 'pg'
import { getAuthorProfile, getPostEngagement } from '@cfb/storage-postgres'

export async function loadPostMetrics(
  pool: pg.Pool,
  postUri: string,
  authorDid: string,
): Promise<PostMetrics> {
  const [engagement, profile] = await Promise.all([
    getPostEngagement(pool, postUri),
    getAuthorProfile(pool, authorDid),
  ])
  return {
    likeCount: engagement?.likeCount ?? 0,
    repostCount: engagement?.repostCount ?? 0,
    replyCount: engagement?.replyCount ?? 0,
    quoteCount: engagement?.quoteCount ?? 0,
    bookmarkCount: engagement?.bookmarkCount ?? 0,
    authorFollowerCount: profile?.followersCount ?? 0,
    authorFollowsCount: profile?.followsCount ?? 0,
    authorPostsCount: profile?.postsCount ?? 0,
  }
}
