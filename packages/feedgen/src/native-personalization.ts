import type { NativePersonalizationConfig } from '@cfb/core-types'
import type { AuthorAffinityRecord, SkeletonPost } from '@cfb/storage-postgres'
import { evalPersonalizationFormula, type PersonalizationPostContext } from './personalization-eval.js'

export interface ViewerPersonalizationContext {
  viewerDid: string
  followedDids: Set<string>
  mutualDids: Set<string>
  /** Post URI → served record (impression count + last served time). */
  seenPosts: Map<string, { impressionCount: number; servedAt: Date }>
  /** Author DID → feed-scoped affinity breakdown. */
  affinityCounts: Map<string, AuthorAffinityRecord>
  /** Hours since this viewer last opened this feed (null if never). */
  hoursSinceLastOpen: number | null
}

/**
 * Apply native personalization to a page of skeleton posts.
 * If formulaEnabled, evaluates the formula per post. Otherwise uses toggle-based logic.
 */
export function applyNativePersonalization(
  posts: SkeletonPost[],
  config: NativePersonalizationConfig | undefined,
  viewer: ViewerPersonalizationContext | undefined,
): SkeletonPost[] {
  if (!config || !viewer) return posts

  // Formula mode: evaluate the L2Expr personalization formula per post
  if (config.formulaEnabled && config.formula) {
    const scored = posts.map((post, originalIdx) => {
      const authorDid = extractAuthorDid(post.post)
      const postCtx: PersonalizationPostContext = {
        postUri: post.post,
        authorDid,
        baseScore: posts.length - originalIdx, // position-based base score
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
  const scored = posts.map((post, originalIdx) => {
    let score = posts.length - originalIdx
    const authorDid = extractAuthorDid(post.post)

    // Boost followed
    if (config.boostFollowed?.enabled && authorDid && viewer.followedDids.has(authorDid)) {
      score *= config.boostFollowed.factor
    }

    // Boost mutuals (stacks with followed)
    if (config.boostMutuals?.enabled && authorDid && viewer.mutualDids.has(authorDid)) {
      score *= config.boostMutuals.factor
    }

    // Suppress seen
    if (config.suppressSeen?.enabled) {
      const seen = viewer.seenPosts.get(post.post)
      if (seen) {
        score *= config.suppressSeen.penalty
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
