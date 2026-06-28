import type { FeedConfig } from '@cfb/core-types'

/** Fields compared to detect draft vs live rule changes. */
export function feedRulesFingerprint(feed: FeedConfig): string {
  return JSON.stringify({
    name: feed.name,
    description: feed.description,
    poolScope: feed.poolScope,
    match: feed.match,
    rank: feed.rank,
  })
}

export function draftsDiffer(live: FeedConfig, draft: FeedConfig): boolean {
  return feedRulesFingerprint(live) !== feedRulesFingerprint(draft)
}

export function isFeedPubliclyServed(feed: FeedConfig): boolean {
  return Boolean(feed.enabled && feed.published)
}

export function isFeedLiveForL2(feed: FeedConfig): boolean {
  return Boolean(feed.enabled)
}
