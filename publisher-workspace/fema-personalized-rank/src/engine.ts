import type { RankerCandidate, ScoredCandidate, ScoringContext, ScoringFactor, PostProcessingFactor, ViewerContext } from './types.js'
import { computeVelocityBaseline, scoringFactors } from './factors.js'
import {
  followingBoostFactor,
  likedDemotionFactor,
  repostedDemotionFactor,
  servedDemotionFactor,
} from './viewer-factors.js'
import { postProcessingFactors } from './diversity.js'

const viewerFactors: ScoringFactor[] = [
  followingBoostFactor,
  servedDemotionFactor,
  likedDemotionFactor,
  repostedDemotionFactor,
]

export function buildScoringContext(
  posts: RankerCandidate[],
  config: ScoringContext['config'],
  viewer?: ViewerContext,
  nowMs = Date.now(),
): ScoringContext {
  const ctx: ScoringContext = {
    nowMs,
    velocityBaseline: computeVelocityBaseline(posts, nowMs, config.velocityBaselinePercentile),
    config,
  }

  if (viewer) {
    ctx.followedAuthorDids = new Set(viewer.followedAuthorDids)
    ctx.servedPosts = new Map(viewer.servedPosts.map((row) => [row.postUri, row]))
    ctx.likedPostUris = new Set(viewer.likedPostUris)
    ctx.repostedPostUris = new Set(viewer.repostedPostUris)
  }

  return ctx
}

function factorsForContext(ctx: ScoringContext): ScoringFactor[] {
  if (ctx.followedAuthorDids || ctx.servedPosts || ctx.likedPostUris || ctx.repostedPostUris) {
    return [...scoringFactors, ...viewerFactors]
  }
  return scoringFactors
}

export function scoreCandidate(
  post: RankerCandidate,
  ctx: ScoringContext,
  factors?: ScoringFactor[],
): ScoredCandidate {
  const active = factors ?? factorsForContext(ctx)
  const breakdown: Record<string, number> = {}
  let score = 1
  for (const factor of active) {
    const value = factor.compute(post, ctx)
    breakdown[factor.name] = value
    score *= value
  }
  return { uri: post.uri, authorDid: post.authorDid, score, breakdown }
}

export function applyPostProcessing(
  posts: ScoredCandidate[],
  ctx: ScoringContext,
  factors: PostProcessingFactor[] = postProcessingFactors,
): ScoredCandidate[] {
  let result = posts
  for (const factor of factors) {
    result = factor.apply(result, ctx)
  }
  return result
}

export function scoreAndRank(
  posts: RankerCandidate[],
  ctx: ScoringContext,
): ScoredCandidate[] {
  const scored = posts.map((post) => scoreCandidate(post, ctx))
  return applyPostProcessing(scored, ctx)
}
