import type { L2NumericField, NormalizedPost, PostMetrics, PostRankSnapshot } from '@cfb/core-types'
import { buildPostRankSnapshot } from '@cfb/post-normalize'

export interface L2RuntimeContext {
  post: NormalizedPost
  metrics: Required<PostMetrics>
  /** Denormalized ingest snapshot — media type, alt text, tag counts, labels. */
  rankSnapshot: PostRankSnapshot
  nowMs: number
}

export function buildL2Runtime(
  post: NormalizedPost,
  metrics?: PostMetrics,
  nowMs = Date.now(),
): L2RuntimeContext {
  return {
    post,
    metrics: {
      likeCount: metrics?.likeCount ?? 0,
      repostCount: metrics?.repostCount ?? 0,
      replyCount: metrics?.replyCount ?? 0,
      quoteCount: metrics?.quoteCount ?? 0,
      bookmarkCount: metrics?.bookmarkCount ?? 0,
      authorFollowerCount: metrics?.authorFollowerCount ?? 0,
      authorFollowsCount: metrics?.authorFollowsCount ?? 0,
      authorPostsCount: metrics?.authorPostsCount ?? 0,
    },
    rankSnapshot: buildPostRankSnapshot(post),
    nowMs,
  }
}

function postAgeHours(ctx: L2RuntimeContext, use: 'indexed_at' | 'created_at'): number {
  const iso = use === 'created_at' ? ctx.post.createdAt : ctx.post.indexedAt
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (ctx.nowMs - t) / (1000 * 60 * 60))
}

export function numericFieldValue(
  ctx: L2RuntimeContext,
  field: L2NumericField,
): number {
  switch (field) {
    case 'like_count':
      return ctx.metrics.likeCount
    case 'repost_count':
      return ctx.metrics.repostCount
    case 'reply_count':
      return ctx.metrics.replyCount
    case 'quote_count':
      return ctx.metrics.quoteCount
    case 'bookmark_count':
      return ctx.metrics.bookmarkCount
    case 'author_follower_count':
      return ctx.metrics.authorFollowerCount
    case 'author_follows_count':
      return ctx.metrics.authorFollowsCount
    case 'author_posts_count':
      return ctx.metrics.authorPostsCount
    case 'facet_tag_count':
      return ctx.rankSnapshot.facetTagCount
    case 'hidden_facet_tag_count':
      return ctx.rankSnapshot.hiddenFacetTagCount
    case 'outline_tag_count':
      return ctx.rankSnapshot.outlineTagCount
    case 'text_length':
      return ctx.rankSnapshot.textLength
    case 'media_type':
      return ctx.rankSnapshot.mediaType
    case 'post_age_hours':
      return postAgeHours(ctx, 'indexed_at')
    case 'image_count':
      return ctx.rankSnapshot.mediaStats.imageCount
    case 'image_max_size_bytes':
      return ctx.rankSnapshot.mediaStats.imageMaxSizeBytes
    case 'image_min_size_bytes':
      return ctx.rankSnapshot.mediaStats.imageMinSizeBytes
    case 'image_total_size_bytes':
      return ctx.rankSnapshot.mediaStats.imageTotalSizeBytes
    case 'image_max_aspect_w':
      return ctx.rankSnapshot.mediaStats.imageMaxAspectWidth
    case 'image_max_aspect_h':
      return ctx.rankSnapshot.mediaStats.imageMaxAspectHeight
    case 'video_size_bytes':
      return ctx.rankSnapshot.mediaStats.videoSizeBytes
    case 'video_aspect_w':
      return ctx.rankSnapshot.mediaStats.videoAspectWidth
    case 'video_aspect_h':
      return ctx.rankSnapshot.mediaStats.videoAspectHeight
    case 'link_thumb_size_bytes':
      return ctx.rankSnapshot.mediaStats.linkThumbSizeBytes
    case 'facet_link_count':
      return ctx.rankSnapshot.mediaStats.facetLinkCount
    case 'facet_mention_count':
      return ctx.rankSnapshot.mediaStats.facetMentionCount
  }
}

export function postAgeHoursForUse(
  ctx: L2RuntimeContext,
  use: 'indexed_at' | 'created_at',
): number {
  return postAgeHours(ctx, use)
}
