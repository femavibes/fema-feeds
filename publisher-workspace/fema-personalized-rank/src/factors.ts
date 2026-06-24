import type { RankerCandidate, ScoringConfig, ScoringContext, ScoringFactor } from './types.js'

function ageHours(post: RankerCandidate, nowMs: number): number {
  const t = Date.parse(post.indexedAt)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (nowMs - t) / (1000 * 60 * 60))
}

function applyEngagementScale(raw: number, scale: ScoringConfig['engagementScale'], factor: number): number {
  const base = Math.max(0, raw) * factor
  switch (scale) {
    case 'log':
      return Math.log1p(base)
    case 'sqrt':
      return Math.sqrt(base)
    default:
      return base
  }
}

export const freshnessFactor: ScoringFactor = {
  name: 'freshness',
  compute(post, ctx) {
    const hours = ageHours(post, ctx.nowMs)
    const decay = Math.pow(0.5, hours / ctx.config.freshnessHalflifeHours)
    return Math.pow(decay, ctx.config.freshnessExponent)
  },
}

export const engagementFactor: ScoringFactor = {
  name: 'engagement',
  compute(post, ctx) {
    const c = ctx.config
    const raw =
      c.coldStartMin +
      c.likeWeight * post.likeCount +
      c.repostWeight * post.repostCount +
      c.replyWeight * post.replyCount +
      c.quoteWeight * post.quoteCount
    const scaled = applyEngagementScale(raw, c.engagementScale, c.engagementScaleFactor)
    return Math.pow(Math.max(scaled, c.coldStartMin), c.engagementExponent)
  },
}

export const velocityFactor: ScoringFactor = {
  name: 'velocity',
  compute(post, ctx) {
    if (!ctx.config.velocityBoostEnabled) return 1
    const hours = Math.max(ageHours(post, ctx.nowMs), 0.25)
    const rate = post.likeCount / hours
    const baseline = Math.max(ctx.velocityBaseline, 0.1)
    if (rate <= baseline) return 1
    return Math.min(ctx.config.velocityCap, rate / baseline)
  },
}

export const followerNormFactor: ScoringFactor = {
  name: 'follower_norm',
  compute(post, ctx) {
    if (!ctx.config.followerNormEnabled) return 1
    const followers = post.authorFollowerCount
    if (followers < ctx.config.followerNormMinFollowers) return 1
    const engagementRate =
      (post.likeCount + post.repostCount + post.replyCount) / Math.max(followers, 1)
    const baseline = ctx.config.followerNormBaselineRate
    if (engagementRate >= baseline) {
      const excess = engagementRate / baseline
      const damp = 1 / (1 + ctx.config.followerNormBoostDampRate * (excess - 1))
      return Math.max(1 / ctx.config.followerNormMaxBoost, damp)
    }
    const deficit = baseline / Math.max(engagementRate, 1e-6)
    return Math.min(ctx.config.followerNormMaxBoost, 1 + ctx.config.followerNormPenaltyAmpRate * (deficit - 1))
  },
}

export const mediaFactor: ScoringFactor = {
  name: 'media',
  compute(post, ctx) {
    return post.hasMedia ? ctx.config.mediaMultiplier : 1
  },
}

export const altTextFactor: ScoringFactor = {
  name: 'alt_text',
  compute(post, ctx) {
    if (!ctx.config.altTextEnabled || !post.hasMedia) return 1
    return post.hasAltText ? 1 : ctx.config.altTextPenalty
  },
}

export const hashtagFactor: ScoringFactor = {
  name: 'hashtag',
  compute(post, ctx) {
    return post.facetTagCount > 0 ? ctx.config.hashtagPostWeight : 1
  },
}

/** Scoring factors ported from Near You — excludes geo; viewer factors when `viewer` present. */
export const scoringFactors: ScoringFactor[] = [
  freshnessFactor,
  engagementFactor,
  velocityFactor,
  followerNormFactor,
  mediaFactor,
  altTextFactor,
  hashtagFactor,
]

export function computeVelocityBaseline(posts: RankerCandidate[], nowMs: number, percentile: number): number {
  const rates: number[] = []
  for (const post of posts) {
    const hours = Math.max(ageHours(post, nowMs), 0.25)
    rates.push(post.likeCount / hours)
  }
  if (rates.length === 0) return 1
  rates.sort((a, b) => a - b)
  const idx = Math.floor((rates.length - 1) * (percentile / 100))
  return Math.max(0.1, rates[idx] ?? 1)
}
