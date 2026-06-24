import { describe, expect, it } from 'vitest'
import { rankRequest } from './index.js'
import type { RankerCandidate } from './types.js'

function post(
  uri: string,
  authorDid: string,
  hoursAgo: number,
  likes: number,
  extra: Partial<RankerCandidate> = {},
): RankerCandidate {
  return {
    uri,
    authorDid,
    indexedAt: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
    likeCount: likes,
    repostCount: 0,
    replyCount: 0,
    quoteCount: 0,
    authorFollowerCount: 1000,
    hasMedia: false,
    hasAltText: true,
    facetTagCount: 0,
    ...extra,
  }
}

describe('fema-personalized-rank', () => {
  it('ranks fresher higher-engagement posts ahead', () => {
    const a = post('at://a', 'did:plc:alice', 2, 50)
    const b = post('at://b', 'did:plc:bob', 48, 5)
    const res = rankRequest({
      feedId: 'test',
      limit: 10,
      candidates: [b.uri, a.uri],
      candidatePosts: [a, b],
    })
    expect(res.uris[0]).toBe('at://a')
  })

  it('applies diversity spacing between same author', () => {
    const posts = [
      post('at://a1', 'did:plc:alice', 1, 100),
      post('at://a2', 'did:plc:alice', 2, 90),
      post('at://b', 'did:plc:bob', 1, 80),
      post('at://c', 'did:plc:carol', 1, 70),
    ]
    const res = rankRequest({
      feedId: 'test',
      limit: 10,
      candidates: posts.map((p) => p.uri),
      candidatePosts: posts,
      config: { diversityMinGap: 2 },
    })
    const idx = (uri: string) => res.uris.indexOf(uri)
    expect(idx('at://a1')).toBeLessThan(idx('at://a2'))
    expect(idx('at://b')).toBeLessThan(idx('at://a2'))
  })

  it('preserves all candidate URIs', () => {
    const posts = [
      post('at://a', 'did:plc:alice', 1, 10),
      post('at://b', 'did:plc:bob', 2, 20),
      post('at://c', 'did:plc:carol', 3, 30),
    ]
    const res = rankRequest({
      feedId: 'test',
      limit: 3,
      candidates: posts.map((p) => p.uri),
      candidatePosts: posts,
    })
    expect(res.uris.sort()).toEqual(['at://a', 'at://b', 'at://c'])
  })

  it('boosts followed authors when viewer context is present', () => {
    const followed = post('at://followed', 'did:plc:friend', 1, 20)
    const other = post('at://other', 'did:plc:stranger', 1, 20)
    const res = rankRequest({
      feedId: 'test',
      limit: 2,
      candidates: [other.uri, followed.uri],
      candidatePosts: [other, followed],
      viewer: {
        viewerDid: 'did:plc:viewer',
        followedAuthorDids: ['did:plc:friend'],
        servedPosts: [],
        likedPostUris: [],
        repostedPostUris: [],
      },
    })
    expect(res.uris[0]).toBe('at://followed')
  })
})
