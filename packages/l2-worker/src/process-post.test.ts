import { describe, expect, it, vi } from 'vitest'
import type { FeedConfig, NormalizedPost } from '@cfb/core-types'
import { processPostForFeeds } from './process-post.js'

const post: NormalizedPost = {
  uri: 'at://did:plc:x/app.bsky.feed.post/1',
  cid: 'bafy',
  authorDid: 'did:plc:author1',
  recordType: 'app.bsky.feed.post',
  text: 'urbanism and transit',
  createdAt: '2026-01-01T00:00:00.000Z',
  langs: ['en'],
  selfLabels: [],
  labelerLabels: [],
  postKind: 'root',
  embed: {
    hasVideo: false,
    hasImage: false,
    hasLinkCard: false,
    hasQuote: false,
    hasRecord: false,
    hasTextOnly: true,
  },
  facetTags: ['urbanism'],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  indexedAt: '2026-01-01T00:00:00.000Z',
}

const feed: FeedConfig = {
  feedId: 'urbanism-main',
  projectId: 'urbanism',
  name: 'Urbanism',
  enabled: true,
  poolScope: 'project_only',
  match: {
    type: 'group',
    id: 'root',
    logic: 'all',
    children: [{ type: 'text', id: 'c1', field: 'text', op: 'contains', value: 'transit' }],
  },
}

vi.mock('@cfb/storage-postgres', () => ({
  upsertFeedCandidate: vi.fn(async () => undefined),
  deleteFeedCandidate: vi.fn(async () => false),
  getPostEngagement: vi.fn(async () => null),
  getAuthorProfile: vi.fn(async () => null),
  getAuthorListCache: vi.fn(async () => null),
}))

vi.mock('./metrics.js', () => ({
  loadPostMetrics: vi.fn(async () => ({})),
}))

vi.mock('./author-lists.js', () => ({
  loadAuthorListsForFeeds: vi.fn(async () => ({})),
}))

describe('processPostForFeeds', () => {
  it('skips feeds for other projects', async () => {
    const pool = {} as import('pg').Pool
    const r = await processPostForFeeds(pool, post, ['other-project'], [feed])
    expect(r.evaluated).toBe(0)
    expect(r.matched).toBe(0)
  })

  it('evaluates matching project feeds', async () => {
    const pool = {} as import('pg').Pool
    const r = await processPostForFeeds(pool, post, ['urbanism'], [feed])
    expect(r.evaluated).toBe(1)
    expect(r.matched).toBe(1)
    expect(r.written).toBe(1)
  })
})
