import type { NativePersonalizationConfig } from '@cfb/core-types'
import { resolveSuppressServed } from '@cfb/core-types'
import type { AuthorAffinityRecord, SkeletonPost } from '@cfb/storage-postgres'
import { evalPersonalizationFormula, type PersonalizationPostContext } from './personalization-eval.js'

/** Per-post serve/view history for one viewer on one feed. */
export interface ViewerServedPostRecord {
  /** Times this post was returned in getFeedSkeleton (impression_count). */
  serveCount: number
  /** Last skeleton serve time. */
  servedAt: Date
  /** First client-reported interactionSeen time, if any. */
  viewedAt: Date | null
}

export interface ViewerPersonalizationContext {
  viewerDid: string
  followedDids: Set<string>
  mutualDids: Set<string>
  /** Post URI → serve/view record for this viewer+feed. */
  servedPosts: Map<string, ViewerServedPostRecord>
  /** Author DID → feed-scoped affinity breakdown. */
  affinityCounts: Map<string, AuthorAffinityRecord>
  /** Hours since this viewer last opened this feed (null if never). */
  hoursSinceLastOpen: number | null
}

/**
 * Base score per post — the real sort_key from sorting, normalized so the
 * minimum is 1 (keeps multiplicative boosts meaningful even with negative
 * or zero keys). Falls back to page position when the window has no score
 * variance (e.g. chronological feeds where every sort_key is 0) or when no
 * sort keys were provided.
 */
function resolveBaseScores(
  posts: SkeletonPost[],
  sortKeys: Map<string, number> | undefined,
): (post: SkeletonPost, idx: number) => number {
  if (sortKeys && sortKeys.size > 0) {
    let min = Infinity
    let max = -Infinity
    for (const p of posts) {
      const k = sortKeys.get(p.post)
      if (k == null) continue
      if (k < min) min = k
      if (k > max) max = k
    }
    if (Number.isFinite(min) && max > min) {
      return (post) => {
        const k = sortKeys.get(post.post)
        return k == null ? 1 : k - min + 1
      }
    }
  }
  return (_post, idx) => posts.length - idx
}

/**
 * Apply native personalization to a window of skeleton posts.
 * If formulaEnabled, evaluates the formula per post. Otherwise uses toggle-based logic.
 * `sortKeys` maps post URI → real sort_key (base_score for formulas).
 */
export function applyNativePersonalization(
  posts: SkeletonPost[],
  config: NativePersonalizationConfig | undefined,
  viewer: ViewerPersonalizationContext | undefined,
  sortKeys?: Map<string, number>,
): SkeletonPost[] {
  if (!config || !viewer) return posts

  const baseScoreOf = resolveBaseScores(posts, sortKeys)

  // Formula mode: evaluate the L2Expr personalization formula per post
  if (config.formulaEnabled && config.formula) {
    const scored = posts.map((post, originalIdx) => {
      const authorDid = extractAuthorDid(post.post)
      const postCtx: PersonalizationPostContext = {
        postUri: post.post,
        authorDid,
        baseScore: baseScoreOf(post, originalIdx),
      }
      const score = evalPersonalizationFormula(config.formula!, viewer, postCtx)
      return { post, score, authorDid }
    })
    scored.sort((a, b) => b.score - a.score)

    // Apply author diversity even in formula mode
    if (config.authorDiversity?.enabled) {
      return applyAuthorDiversity(scored, config.authorDiversity.maxConsecutive)
    }
    return scored.map((r) => r.post)
  }

  // Toggle mode: apply individual toggles
  const suppressServed = resolveSuppressServed(config)
  const scored = posts.map((post, originalIdx) => {
    let score = baseScoreOf(post, originalIdx)
    const authorDid = extractAuthorDid(post.post)

    // Boost followed
    if (config.boostFollowed?.enabled && authorDid && viewer.followedDids.has(authorDid)) {
      score *= config.boostFollowed.factor
    }

    // Boost mutuals (stacks with followed)
    if (config.boostMutuals?.enabled && authorDid && viewer.mutualDids.has(authorDid)) {
      score *= config.boostMutuals.factor
    }

    // Suppress recently served (penalty is a score multiplier; must be < 1 to have any effect)
    if (suppressServed?.enabled) {
      const penalty = suppressServed.penalty
      if (penalty < 1) {
        const served = viewer.servedPosts.get(post.post)
        if (served) {
          const hoursSinceServed =
            (Date.now() - served.servedAt.getTime()) / (1000 * 60 * 60)
          if (hoursSinceServed <= suppressServed.windowHours) {
            score *= penalty
          }
        }
      }
    }

    // Affinity boost
    if (config.affinityBoost?.enabled && authorDid) {
      const record = viewer.affinityCounts.get(authorDid)
      if (record && record.total > 0) {
        // Diminishing returns: log(count + 1) * factor
        score *= 1 + Math.log(record.total + 1) * (config.affinityBoost.factor - 1)
      }
    }

    return { post, score, authorDid }
  })

  // Sort by personalization score (descending)
  scored.sort((a, b) => b.score - a.score)

  // Apply author diversity (post-sort)
  if (config.authorDiversity?.enabled) {
    return applyAuthorDiversity(scored, config.authorDiversity.maxConsecutive)
  }

  return scored.map((r) => r.post)
}

function applyAuthorDiversity(
  scored: { post: SkeletonPost; score: number; authorDid: string | null }[],
  maxConsecutive: number,
): SkeletonPost[] {
  const result: typeof scored = []
  const authorStreak = new Map<string, number>()
  const deferred: typeof scored = []

  for (const item of scored) {
    const streak = item.authorDid ? (authorStreak.get(item.authorDid) ?? 0) : 0
    if (streak >= maxConsecutive) {
      deferred.push(item)
    } else {
      result.push(item)
      if (item.authorDid) authorStreak.set(item.authorDid, streak + 1)
      for (const [did] of authorStreak) {
        if (did !== item.authorDid) authorStreak.set(did, 0)
      }
    }
  }
  result.push(...deferred)
  return result.map((r) => r.post)
}

/** Extract author DID from an AT-URI: at://did:plc:xxx/app.bsky.feed.post/yyy */
function extractAuthorDid(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\//)
  return match ? match[1]! : null
}
