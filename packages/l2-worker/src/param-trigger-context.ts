import type { FeedConfig } from '@cfb/core-types'
import type { ParamTriggerTickContext } from '@cfb/l2-graph'
import { collectParamControls, triggersForControl } from '@cfb/l2-graph'
import {
  authorPostedRecentlyForFeed,
  countFeedParamMatches,
  getFeedParamLastMatchAt,
  takePendingListEvent,
} from '@cfb/storage-postgres'
import type pg from 'pg'

function matchCountKey(windowMinutes: number, nodeId?: string): string {
  return `${windowMinutes}:${nodeId ?? ''}`
}

/** Build a sync tick context with DB lookups resolved up front. */
export async function buildParamTriggerContext(
  pool: pg.Pool,
  feed: FeedConfig,
  now: Date = new Date(),
): Promise<ParamTriggerTickContext> {
  const feedId = feed.feedId
  const matchCountCache = new Map<string, number>()
  const lastMatchCache = new Map<string, Date | null>()
  const authorCache = new Map<string, boolean>()
  const listEventCache = new Map<string, 'member_added' | 'member_removed' | 'any_change' | null>()

  for (const control of collectParamControls(feed.match)) {
    for (const trigger of triggersForControl(control)) {
      if (trigger.kind === 'match_rate') {
        const nodeId = trigger.scope === 'node' ? trigger.nodeId : undefined
        const key = matchCountKey(trigger.windowMinutes, nodeId)
        if (!matchCountCache.has(key)) {
          matchCountCache.set(
            key,
            await countFeedParamMatches(pool, feedId, trigger.windowMinutes, nodeId),
          )
        }
      }
      if (trigger.kind === 'staleness') {
        const nodeId = trigger.scope === 'node' ? trigger.nodeId : undefined
        const key = nodeId ?? '__feed__'
        if (!lastMatchCache.has(key)) {
          lastMatchCache.set(key, await getFeedParamLastMatchAt(pool, feedId, nodeId))
        }
      }
      if (trigger.kind === 'author_post') {
        const key = JSON.stringify({
          dids: trigger.authorDids ?? [],
          lists: trigger.authorListIds ?? [],
          lookback: trigger.lookbackMinutes ?? 5,
        })
        if (!authorCache.has(key)) {
          authorCache.set(
            key,
            await authorPostedRecentlyForFeed(
              pool,
              feedId,
              trigger.authorDids ?? [],
              trigger.authorListIds ?? [],
              trigger.lookbackMinutes ?? 5,
            ),
          )
        }
      }
      if (trigger.kind === 'list_membership') {
        if (!listEventCache.has(trigger.listId)) {
          listEventCache.set(
            trigger.listId,
            await takePendingListEvent(pool, feedId, trigger.listId),
          )
        }
      }
    }
  }

  return {
    now,
    matchCount: (windowMinutes, nodeId) =>
      matchCountCache.get(matchCountKey(windowMinutes, nodeId)) ?? 0,
    lastMatchAt: (nodeId) => lastMatchCache.get(nodeId ?? '__feed__') ?? null,
    authorPostedRecently: (authorDids, authorListIds, lookbackMinutes) => {
      const key = JSON.stringify({ dids: authorDids, lists: authorListIds, lookback: lookbackMinutes })
      return authorCache.get(key) ?? false
    },
    listMembershipEvent: (listId) => listEventCache.get(listId) ?? null,
  }
}
