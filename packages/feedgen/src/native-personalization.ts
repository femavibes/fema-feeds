import type { NativePersonalizationConfig } from '@cfb/core-types'
import type { SkeletonPost } from '@cfb/storage-postgres'

export interface ViewerPersonalizationContext {
  viewerDid: string
  followedDids: Set<string>
  mutualDids: Set<string>
  /** Post URIs the viewer has been served recently. */
  seenPostUris: Set<string>
  /** Author DID → interaction count (likes, replies in window). */
  affinityCounts?: Map<string, number>
}

/**
 * Apply native personalization to a page of skeleton posts.
 * Reorders based on viewer-specific signals without custom code.
 */
export function applyNativePersonalization(
  posts: SkeletonPost[],
  config: NativePersonalizationConfig | undefined,
  viewer: ViewerPersonalizationContext | undefined,
): SkeletonPost[] {
  if (!config || !viewer) return posts

  // Score each post with personalization adjustments
  const scored = posts.map((post, originalIdx) => {
    let score = posts.length - originalIdx // preserve base order as starting score
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
    if (config.suppressSeen?.enabled && viewer.seenPostUris.has(post.post)) {
      score *= config.suppressSeen.penalty
    }

    // Affinity boost
    if (config.affinityBoost?.enabled && authorDid && viewer.affinityCounts) {
      const count = viewer.affinityCounts.get(authorDid) ?? 0
      if (count > 0) {
        // Diminishing returns: log(count + 1) * factor
        score *= 1 + Math.log(count + 1) * (config.affinityBoost.factor - 1)
      }
    }

    return { post, score, authorDid }
  })

  // Sort by personalization score (descending)
  scored.sort((a, b) => b.score - a.score)

  // Apply author diversity (post-sort)
  if (config.authorDiversity?.enabled) {
    const maxConsecutive = config.authorDiversity.maxConsecutive
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
        // Reset other authors' streaks
        for (const [did] of authorStreak) {
          if (did !== item.authorDid) authorStreak.set(did, 0)
        }
      }
    }
    // Append deferred at the end
    result.push(...deferred)
    return result.map((r) => r.post)
  }

  return scored.map((r) => r.post)
}

/** Extract author DID from an AT-URI: at://did:plc:xxx/app.bsky.feed.post/yyy */
function extractAuthorDid(uri: string): string | null {
  const match = uri.match(/^at:\/\/([^/]+)\//)
  return match ? match[1]! : null
}
