import { resolveScoringConfig } from './config.js'
import { buildScoringContext, scoreAndRank } from './engine.js'
import type { RankerCandidate, RankerRequest, RankerResponse } from './types.js'

function postsFromRequest(request: RankerRequest): RankerCandidate[] {
  if (request.candidatePosts?.length) {
    const byUri = new Map(request.candidatePosts.map((p) => [p.uri, p]))
    return request.candidates
      .map((uri) => byUri.get(uri))
      .filter((p): p is RankerCandidate => p != null)
  }
  // Fallback: URI-only stubs (engagement/freshness factors neutralize to defaults)
  return request.candidates.map((uri, i) => ({
    uri,
    authorDid: `did:unknown:${i}`,
    indexedAt: new Date().toISOString(),
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    quoteCount: 0,
    authorFollowerCount: 0,
    hasMedia: false,
    hasAltText: true,
    facetTagCount: 0,
  }))
}

/** Main ranker entry — used by WASM, remote service, and tests. */
export function rankRequest(request: RankerRequest): RankerResponse {
  const config = resolveScoringConfig(request.config)
  const posts = postsFromRequest(request)
  const ctx = buildScoringContext(posts, config, request.viewer)
  const ranked = scoreAndRank(posts, ctx)
  return { uris: ranked.map((p) => p.uri) }
}

export { resolveScoringConfig, DEFAULT_SCORING_CONFIG, PRESETS } from './config.js'
export { scoreAndRank, buildScoringContext, scoreCandidate } from './engine.js'
export type { RankerCandidate, RankerRequest, RankerResponse, ScoredCandidate, ScoringConfig } from './types.js'
