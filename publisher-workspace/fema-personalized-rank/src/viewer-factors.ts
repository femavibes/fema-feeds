import type { RankerCandidate, ScoringConfig, ScoringContext, ScoringFactor } from './types.js'

function servedPenalty(
  post: RankerCandidate,
  ctx: ScoringContext,
  config: ScoringConfig,
): number {
  if (!config.servedDemotionEnabled || !ctx.servedPosts) return 1
  const served = ctx.servedPosts.get(post.uri)
  if (!served) return 1

  const hoursSince =
    (ctx.nowMs - Date.parse(served.servedAt)) / (1000 * 60 * 60)
  if (!Number.isFinite(hoursSince) || hoursSince < 0) return 1

  const minH = config.servedMinDurationHours
  const maxH = Math.max(config.servedMaxDurationHours, minH + 0.01)
  if (hoursSince <= minH) {
    return Math.max(config.servedVisibilityFloor, 1 - config.servedBasePenalty)
  }
  if (hoursSince >= maxH) return 1

  const t = (hoursSince - minH) / (maxH - minH)
  const recovery = 1 - config.servedBasePenalty * (1 - t)
  return Math.max(config.servedVisibilityFloor, recovery)
}

export const followingBoostFactor: ScoringFactor = {
  name: 'following_boost',
  compute(post, ctx) {
    if (!ctx.config.followingBoostEnabled || !ctx.followedAuthorDids) return 1
    return ctx.followedAuthorDids.has(post.authorDid)
      ? ctx.config.followingBoostMultiplier
      : 1
  },
}

export const servedDemotionFactor: ScoringFactor = {
  name: 'served_demotion',
  compute(post, ctx) {
    return servedPenalty(post, ctx, ctx.config)
  },
}

export const likedDemotionFactor: ScoringFactor = {
  name: 'liked_demotion',
  compute(post, ctx) {
    if (!ctx.config.likedDemotionEnabled || !ctx.likedPostUris) return 1
    return ctx.likedPostUris.has(post.uri) ? ctx.config.likedPenalty : 1
  },
}

export const repostedDemotionFactor: ScoringFactor = {
  name: 'reposted_demotion',
  compute(post, ctx) {
    if (!ctx.config.repostedDemotionEnabled || !ctx.repostedPostUris) return 1
    return ctx.repostedPostUris.has(post.uri) ? ctx.config.repostedPenalty : 1
  },
}
