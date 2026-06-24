import type { FeedConfig } from '@cfb/core-types'

export interface ParsedGeneratorUri {
  did: string
  rkey: string
}

/** Parse at://did/app.bsky.feed.generator/rkey */
export function parseGeneratorUri(uri: string): ParsedGeneratorUri | null {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/.exec(uri.trim())
  if (!m) return null
  return { did: m[1]!, rkey: m[2]! }
}

export function buildPublishedFeedUri(generatorDid: string, feed: FeedConfig): string {
  if (feed.publishedUri) return feed.publishedUri
  const rkey = feed.atprotoRkey ?? feed.feedId
  return `at://${generatorDid}/app.bsky.feed.generator/${rkey}`
}

export function resolveFeedByUri(
  feeds: FeedConfig[],
  generatorDid: string,
  feedUri: string,
): FeedConfig | null {
  for (const feed of feeds) {
    if (buildPublishedFeedUri(generatorDid, feed) === feedUri) return feed
  }
  const parsed = parseGeneratorUri(feedUri)
  if (!parsed || parsed.did !== generatorDid) return null
  return (
    feeds.find(
      (f) => f.atprotoRkey === parsed.rkey || f.feedId === parsed.rkey,
    ) ?? null
  )
}
