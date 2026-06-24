import { describe, expect, it } from 'vitest'
import type { FeedConfig } from '@cfb/core-types'
import { buildPublishedFeedUri, parseGeneratorUri, resolveFeedByUri } from './uri.js'

const feed: FeedConfig = {
  feedId: 'urbanism-main',
  projectId: 'urbanism',
  name: 'Urbanism',
  enabled: true,
  poolScope: 'project_only',
  match: { type: 'group', id: 'root', logic: 'all', children: [] },
}

describe('feedgen uri', () => {
  it('parses generator URIs', () => {
    expect(parseGeneratorUri('at://did:plc:abc/app.bsky.feed.generator/my-feed')).toEqual({
      did: 'did:plc:abc',
      rkey: 'my-feed',
    })
  })

  it('builds URI from feedId', () => {
    expect(buildPublishedFeedUri('did:plc:gen', feed)).toBe(
      'at://did:plc:gen/app.bsky.feed.generator/urbanism-main',
    )
  })

  it('resolves feed by URI', () => {
    const uri = 'at://did:plc:gen/app.bsky.feed.generator/urbanism-main'
    expect(resolveFeedByUri([feed], 'did:plc:gen', uri)?.feedId).toBe('urbanism-main')
  })
})
