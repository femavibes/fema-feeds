import { describe, expect, it } from 'vitest'
import type { NormalizedPost } from '@cfb/core-types'
import { buildPostRankSnapshot, detectNearYouMediaType } from './rank-snapshot.js'

const base: NormalizedPost = {
  uri: 'at://did:plc:a/app.bsky.feed.post/1',
  cid: 'bafy',
  authorDid: 'did:plc:a',
  recordType: 'app.bsky.feed.post',
  text: 'hello #world',
  createdAt: '2026-06-17T10:00:00.000Z',
  langs: ['en'],
  selfLabels: [],
  labelerLabels: [],
  postKind: 'root',
  embed: { hasVideo: false, hasImage: true, hasLinkCard: false, hasQuote: false, hasRecord: false, hasTextOnly: false },
  embedDetail: { images: [{ alt: 'desc' }] },
  facetTags: ['world'],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  indexedAt: '2026-06-17T10:05:00.000Z',
}

describe('rank-snapshot', () => {
  it('detects image media type', () => {
    expect(detectNearYouMediaType(base.embedDetail, base.embed)).toBe(1)
  })

  it('builds snapshot with alt text and tag counts', () => {
    const snap = buildPostRankSnapshot(base)
    expect(snap.mediaType).toBe(1)
    expect(snap.hasAltText).toBe(true)
    expect(snap.facetTagCount).toBe(1)
    expect(snap.textLength).toBe(base.text.length)
  })
})
