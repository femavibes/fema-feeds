import type { EngagementCounter } from '@cfb/core-types'

export interface EngagementEvent {
  collection: 'app.bsky.feed.like' | 'app.bsky.feed.repost'
  operation: 'create' | 'delete'
  subjectUri: string
}

export interface EngagementJetstreamOptions {
  jetstreamUrl?: string
  onEngagement: (event: EngagementEvent) => void | Promise<void>
  onError?: (err: unknown) => void
}

function subjectUriFromRecord(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null
  const subject = (record as { subject?: { uri?: string } }).subject
  return typeof subject?.uri === 'string' ? subject.uri : null
}

function mapCollection(collection: string): EngagementEvent['collection'] | null {
  if (collection === 'app.bsky.feed.like') return 'app.bsky.feed.like'
  if (collection === 'app.bsky.feed.repost') return 'app.bsky.feed.repost'
  return null
}

const DEFAULT_JETSTREAM_URL = 'wss://jetstream1.us-east.bsky.network/subscribe'

/**
 * Jetstream consumer for likes/reposts targeting posts already in our pool.
 * Global stream — handler should filter to pool URIs.
 */
export async function startEngagementJetstream(
  options: EngagementJetstreamOptions,
): Promise<{ stop: () => void }> {
  const { Jetstream } = await import('@skyware/jetstream')
  const endpoint = options.jetstreamUrl ?? process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL

  const client = new Jetstream({
    endpoint,
    wantedCollections: ['app.bsky.feed.like', 'app.bsky.feed.repost'],
  })

  const emit = (collection: string, operation: 'create' | 'delete', record: unknown) => {
    const mapped = mapCollection(collection)
    const subjectUri = subjectUriFromRecord(record)
    if (!mapped || !subjectUri) return
    void options.onEngagement({ collection: mapped, operation, subjectUri })
  }

  client.onCreate('app.bsky.feed.like', (event) => {
    emit(event.commit.collection, 'create', event.commit.record)
  })
  client.onDelete('app.bsky.feed.like', () => {
    // Delete events lack subject URI; decrement requires interaction tracking (future).
  })

  client.onCreate('app.bsky.feed.repost', (event) => {
    emit(event.commit.collection, 'create', event.commit.record)
  })
  client.onDelete('app.bsky.feed.repost', () => {
    // See like delete — v0 tracks creates only.
  })

  client.on('error', (err: unknown) => options.onError?.(err))
  client.start()

  return { stop: () => client.close() }
}

export function engagementCounterForCollection(
  collection: EngagementEvent['collection'],
): EngagementCounter {
  return collection === 'app.bsky.feed.like' ? 'like' : 'repost'
}

export function engagementDelta(operation: EngagementEvent['operation']): number {
  return operation === 'create' ? 1 : -1
}
