import type { FeedInteractionEvent } from '@cfb/core-types'
import type pg from 'pg'
import { applyFeedInteractionEvents, type FeedInteractionInput } from '@cfb/storage-postgres'
import { parseFeedContext } from './feed-context.js'

export interface BlueskyFeedInteraction {
  item?: string
  event?: string
  feedContext?: string
  reqId?: string
}

export interface SendInteractionsResult {
  ok: true
}

export interface SendInteractionsError {
  error: string
  status: number
}

const TRACKED_EVENTS = new Set<string>([
  'app.bsky.feed.defs#interactionSeen',
  'app.bsky.feed.defs#interactionLike',
  'app.bsky.feed.defs#interactionRepost',
  'app.bsky.feed.defs#interactionReply',
  'app.bsky.feed.defs#interactionQuote',
  'app.bsky.feed.defs#interactionShare',
])

function normalizeEvent(raw: string | undefined): FeedInteractionEvent | null {
  switch (raw) {
    case 'app.bsky.feed.defs#interactionSeen':
      return 'interactionSeen'
    case 'app.bsky.feed.defs#interactionLike':
      return 'interactionLike'
    case 'app.bsky.feed.defs#interactionRepost':
      return 'interactionRepost'
    case 'app.bsky.feed.defs#interactionReply':
      return 'interactionReply'
    case 'app.bsky.feed.defs#interactionQuote':
      return 'interactionQuote'
    case 'app.bsky.feed.defs#interactionShare':
      return 'interactionShare'
    default:
      return null
  }
}

function interactionFromBluesky(row: BlueskyFeedInteraction): FeedInteractionInput | null {
  if (!row.item?.startsWith('at://')) return null
  if (!row.event || !TRACKED_EVENTS.has(row.event)) return null
  const event = normalizeEvent(row.event)
  if (!event) return null

  const parsed = parseFeedContext(row.feedContext)
  return {
    postUri: row.item,
    event,
    feedId: parsed?.feedId,
    reqId: row.reqId ?? parsed?.reqId,
  }
}

export async function handleSendFeedInteractions(
  pool: pg.Pool,
  viewerDid: string | undefined,
  body: { feed?: string; interactions?: BlueskyFeedInteraction[] },
): Promise<SendInteractionsResult | SendInteractionsError> {
  if (!viewerDid) {
    return { ok: true }
  }

  const interactions = body.interactions ?? []
  if (interactions.length === 0) {
    return { ok: true }
  }

  const mapped = interactions
    .map(interactionFromBluesky)
    .filter((row): row is FeedInteractionInput => row != null)

  if (mapped.length > 0) {
    await applyFeedInteractionEvents(pool, viewerDid, mapped)
  }

  return { ok: true }
}
