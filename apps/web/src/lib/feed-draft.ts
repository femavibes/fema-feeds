import type { FeedConfig } from '@cfb/core-types'
import { normalizeCanvasFeedStorage } from '@cfb/l2-graph'

import { api } from '../api/client'

export function prepareFeedDraftPayload(feed: FeedConfig): FeedConfig {
  return feed.visualLayout?.edges?.length
    ? { ...feed, match: normalizeCanvasFeedStorage(feed.match) }
    : feed
}

export async function persistFeedDraft(feed: FeedConfig) {
  return api.saveFeedDraft(prepareFeedDraftPayload(feed))
}
