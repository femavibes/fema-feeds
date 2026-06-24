import type { PostProcessingFactor, ScoredCandidate, ScoringContext } from './types.js'

/** Greedy author spacing — adapted from Near You diversity mixer. */
export const diversityFactor: PostProcessingFactor = {
  name: 'diversity',
  apply(posts, ctx) {
    if (!ctx.config.diversityEnabled || ctx.config.diversityMinGap <= 0) return posts
    const minGap = ctx.config.diversityMinGap
    const sorted = [...posts].sort((a, b) => b.score - a.score)
    const result: ScoredCandidate[] = []
    const lastAuthorIndex = new Map<string, number>()

    for (const post of sorted) {
      const lastIdx = lastAuthorIndex.get(post.authorDid)
      if (lastIdx != null && result.length - lastIdx < minGap) {
        continue
      }
      lastAuthorIndex.set(post.authorDid, result.length)
      result.push(post)
    }

    // Append any skipped posts to avoid dropping candidates
    const used = new Set(result.map((p) => p.uri))
    for (const post of sorted) {
      if (!used.has(post.uri)) result.push(post)
    }
    return result
  },
}

export const postProcessingFactors: PostProcessingFactor[] = [diversityFactor]
