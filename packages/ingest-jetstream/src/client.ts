import type { NormalizedPost } from '@cfb/core-types'
import {
  normalizeJetstreamPost,
  normalizeJetstreamRepost,
  type JetstreamPostEvent,
} from '@cfb/post-normalize'

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

export function mapJetstreamRepostEvent(event: {
  did: string
  time_us: number
  commit: { cid: string; rkey: string; record: unknown }
}): Parameters<typeof normalizeJetstreamRepost>[0] {
  return {
    uri: `at://${event.did}/app.bsky.feed.repost/${event.commit.rkey}`,
    cid: event.commit.cid,
    author: event.did,
    record: event.commit.record as Parameters<typeof normalizeJetstreamRepost>[0]['record'],
    time: new Date(Math.floor(event.time_us / 1000)).toISOString(),
  }
}

/**
 * Start Jetstream ingestion (same endpoint as ATlas Near You).
 * Default: wss://jetstream1.us-east.bsky.network/subscribe
 * Subscribes to posts + reposts (repost → postKind=repost for Post type filters).
 */
export async function startJetstreamIngest(
  jetstreamUrl: string,
  options: JetstreamIngestOptions,
): Promise<{ stop: () => void }> {
  const { Jetstream } = await import('@skyware/jetstream')

  const client = new Jetstream({
    endpoint: jetstreamUrl,
    wantedCollections: ['app.bsky.feed.post', 'app.bsky.feed.repost'],
  })

  client.onCreate('app.bsky.feed.post', (event) => {
    void options.onPost(normalizeJetstreamPost(mapJetstreamCreateEvent(event)))
  })

  client.onCreate('app.bsky.feed.repost', (event) => {
    void options.onPost(normalizeJetstreamRepost(mapJetstreamRepostEvent(event)))
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
