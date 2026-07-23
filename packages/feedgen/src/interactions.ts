import type { FeedInteractionEvent } from '@cfb/core-types'
import type pg from 'pg'
import { applyFeedInteractionEvents, type FeedInteractionInput } from '@cfb/storage-postgres'
import { parseFeedContext } from './feed-context.js'

export interface BlueskyFeedInteraction {
  item?: string
  event?: string
  feedContext?: string
  reqId?: string
  /** Typed clients may put the event in $type instead of event. */
  $type?: string
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
  'app.bsky.feed.defs#requestLess',
  'app.bsky.feed.defs#requestMore',
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

/** Resolve ATProto interaction event string from event or $type. */
export function resolveInteractionEvent(row: BlueskyFeedInteraction): string | undefined {
  if (row.event && TRACKED_EVENTS.has(row.event)) return row.event
  const t = row.$type
  if (!t || t === 'app.bsky.feed.defs#interaction') return undefined
  if (TRACKED_EVENTS.has(t)) return t
  return undefined
}

/** Parse feedId slug from at://…/app.bsky.feed.generator/{feedId}. */
export function feedIdFromFeedParam(feed?: string): string | undefined {
  if (!feed) return undefined
  const match = feed.match(/app\.bsky\.feed\.generator\/([^/?#]+)/i)
  return match?.[1]
}

function interactionFromBluesky(
  row: BlueskyFeedInteraction,
  fallbackFeedId?: string,
): FeedInteractionInput | null {
  if (!row.item?.startsWith('at://')) return null
  const eventRaw = resolveInteractionEvent(row)
  if (!eventRaw) return null
  const event = normalizeEvent(eventRaw)
  if (!event) return null

  const parsed = parseFeedContext(row.feedContext)
  const feedId = parsed?.feedId ?? fallbackFeedId

  return {
    postUri: row.item,
    event,
    feedId,
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

  const fallbackFeedId = feedIdFromFeedParam(body.feed)
  const mapped = interactions
    .map((row) => interactionFromBluesky(row, fallbackFeedId))
    .filter((row): row is FeedInteractionInput => row != null)

  if (mapped.length > 0) {
    await applyFeedInteractionEvents(pool, viewerDid, mapped)
    console.info(
      '[feedgen] sendInteractions',
      viewerDid,
      fallbackFeedId ?? mapped.find((m) => m.feedId)?.feedId ?? '?',
      mapped.length,
      mapped.map((m) => m.event).join(','),
    )
  }

  return { ok: true }
}
