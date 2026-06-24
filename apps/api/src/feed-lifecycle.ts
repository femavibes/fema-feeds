import type { FeedConfig } from '@cfb/core-types'
import { normalizeCanvasFeedStorage, sanitizeCanvasEdges } from '@cfb/l2-graph'

export function normalizeFeedDraft(feed: FeedConfig): FeedConfig {
  if (!feed.visualLayout?.edges?.length) {
    return feed
  }
  const match = normalizeCanvasFeedStorage(feed.match)
  const edges = sanitizeCanvasEdges(match, feed.visualLayout.edges)
  return {
    ...feed,
    match,
    visualLayout: { ...feed.visualLayout, edges },
  }
}

/** Promote editor draft to live config (preserves publish metadata). */
export function mergeDraftIntoLive(live: FeedConfig, draft: FeedConfig): FeedConfig {
  const normalized = normalizeFeedDraft(draft)
  return {
    ...live,
    name: normalized.name,
    description: normalized.description,
    poolScope: normalized.poolScope,
    match: normalized.match,
    visualLayout: normalized.visualLayout,
    rank: normalized.rank,
    injector: normalized.injector,
    authorLists: normalized.authorLists,
    feedId: live.feedId,
    projectId: live.projectId,
    ownerDid: live.ownerDid ?? normalized.ownerDid,
    publishedUri: live.publishedUri,
    atprotoRkey: live.atprotoRkey ?? normalized.atprotoRkey,
    published: live.published,
    publishedAt: live.publishedAt,
    enabled: true,
    liveAt: new Date().toISOString(),
  }
}

export function newFeedShell(
  feed: FeedConfig,
  ownerDid: string | null,
): FeedConfig {
  return {
    ...feed,
    ownerDid: ownerDid ?? feed.ownerDid,
    enabled: false,
    published: false,
    liveAt: undefined,
    publishedAt: undefined,
  }
}
