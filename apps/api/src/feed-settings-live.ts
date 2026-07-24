import type { FeedConfig } from '@cfb/core-types'
import { draftsDiffer } from '@cfb/core-types'
import { loadFeed, saveFeed } from '@cfb/feed-config'
import type { Pool } from '@cfb/storage-postgres'
import { saveFeedDraft } from '@cfb/storage-postgres'
import { startBackgroundRescoreCandidates } from '@cfb/l2-worker'
import { normalizeFeedDraft } from './feed-lifecycle.js'
import { stampFeedForSave } from './request-user.js'

export function rankSettingsFingerprint(rank: FeedConfig['rank']): string {
  return JSON.stringify(rank ?? null)
}

export function personalizationSettingsFingerprint(
  personalization: FeedConfig['personalization'],
): string {
  return JSON.stringify(personalization ?? null)
}

export interface ApplyFeedSettingsResult {
  feed: FeedConfig
  live: FeedConfig
  hasUnpublishedDraft: boolean
  rankRescoreStarted: boolean
}

/** Promote sort/personalization settings to the live feed file (no match-rule rebuild). */
export async function applyFeedSettingsLive(
  feedsDir: string,
  pool: Pool,
  feedId: string,
  userDid: string,
  body: FeedConfig,
): Promise<ApplyFeedSettingsResult> {
  const live = await loadFeed(feedsDir, feedId)

  const draft = normalizeFeedDraft(
    stampFeedForSave(
      {
        ...body,
        feedId,
        projectId: live.projectId,
        enabled: live.enabled,
        published: live.published,
        publishedAt: live.publishedAt,
        liveAt: live.liveAt,
        publishedUri: live.publishedUri,
      },
      userDid,
    ),
  )

  const rankChanged = rankSettingsFingerprint(live.rank) !== rankSettingsFingerprint(draft.rank)
  const nextLive: FeedConfig = {
    ...live,
    rank: draft.rank,
    personalization: draft.personalization,
  }

  await saveFeed(feedsDir, nextLive)
  await saveFeedDraft(pool, feedId, userDid, draft)

  let rankRescoreStarted = false
  if (rankChanged) {
    startBackgroundRescoreCandidates(pool, nextLive)
    rankRescoreStarted = true
  }

  return {
    feed: draft,
    live: nextLive,
    hasUnpublishedDraft: draftsDiffer(nextLive, draft),
    rankRescoreStarted,
  }
}
