import type { NormalizedPost } from '@cfb/core-types'
import { normalizeJetstreamPost, type JetstreamPostEvent } from '@cfb/post-normalize'

export type PostHandler = (post: NormalizedPost) => void | Promise<void>

export interface JetstreamIngestOptions {
  onPost: PostHandler
  onError?: (err: unknown) => void
}

/** Map @skyware/jetstream create event → our JetstreamPostEvent shape. */
export function mapJetstreamCreateEvent(event: {
  did: string
  time_us: number
  commit: { cid: string; rkey: string; record: unknown }
}): JetstreamPostEvent {
  return {
    uri: `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`,
    cid: event.commit.cid,
    author: event.did,
    record: event.commit.record as JetstreamPostEvent['record'],
    time: new Date(Math.floor(event.time_us / 1000)).toISOString(),
  }
}

/**
 * Start Jetstream ingestion (same endpoint as ATlas Near You).
 * Default: wss://jetstream1.us-east.bsky.network/subscribe
 */
export async function startJetstreamIngest(
  jetstreamUrl: string,
  options: JetstreamIngestOptions,
): Promise<{ stop: () => void }> {
  const { Jetstream } = await import('@skyware/jetstream')

  const client = new Jetstream({
    endpoint: jetstreamUrl,
    wantedCollections: ['app.bsky.feed.post'],
  })

  client.onCreate('app.bsky.feed.post', (event) => {
    void options.onPost(normalizeJetstreamPost(mapJetstreamCreateEvent(event)))
  })

  client.on('error', (err: unknown) => options.onError?.(err))
  client.start()

  return { stop: () => client.close() }
}

export async function ingestFixtureEvent(
  event: JetstreamPostEvent,
  onPost: PostHandler,
): Promise<void> {
  await onPost(normalizeJetstreamPost(event))
}
