import { describe, expect, it } from 'vitest'
import type { CompiledIngestGate, NormalizedPost } from '@cfb/core-types'
import { buildOptimizedStrictGate, evalOptimizedStrictGate } from './strict-gate-optimize.js'

function post(partial: Partial<NormalizedPost> & Pick<NormalizedPost, 'text' | 'langs'>): NormalizedPost {
  return {
    uri: 'at://did:plc:x/app.bsky.feed.post/1',
    cid: 'bafy',
    authorDid: 'did:plc:x',
    recordType: 'app.bsky.feed.post',
    createdAt: '2024-01-01T00:00:00.000Z',
    selfLabels: [],
    labelerLabels: [],
    postKind: 'root',
    embed: {
      hasVideo: false,
      hasGif: false,
      hasImage: false,
      hasLinkCard: false,
      hasQuote: false,
      hasQuoteWithMedia: false,
      hasRecord: false,
      hasTextOnly: true,
    },
    facetTags: [],
    hiddenFacetTags: [],
    facetLinks: [],
    facetMentions: [],
    outlineTags: [],
    indexedAt: '2024-01-01T00:00:00.000Z',
    ...partial,
  }
}

/** Canvas AND: keyword discover + language restrict (how compileStrictGate splits the path). */
const canvasAndGate: CompiledIngestGate = {
  includeBranches: [
    {
      type: 'keyword',
      op: 'includes',
      terms: ['cat'],
      fields: ['text'],
      sourceFeedId: 'f1',
      sourceNodeId: 'kw1',
    },
  ],
  excludeBranches: [],
  restrictBranches: [
    {
      type: 'language',
      allow: ['en'],
      unknown: 'exclude',
      sourceFeedId: 'f1',
      sourceNodeId: 'lang1',
    },
  ],
}

describe('evalOptimizedStrictGate restrictBranches', () => {
  it('rejects keyword hits that fail language restrict (unknown excluded)', () => {
    const opt = buildOptimizedStrictGate(canvasAndGate)
    expect(opt.requiredLanguages?.has('en')).toBe(true)
    expect(opt.allowUnknownLanguage).toBe(false)

    expect(
      evalOptimizedStrictGate(
        opt,
        post({ text: 'I love my cat', langs: ['en'] }),
      ),
    ).toBe(true)

    expect(
      evalOptimizedStrictGate(
        opt,
        post({ text: 'I love my cat', langs: [] }),
      ),
    ).toBe(false)

    expect(
      evalOptimizedStrictGate(
        opt,
        post({ text: 'I love my cat', langs: ['es'] }),
      ),
    ).toBe(false)

    expect(
      evalOptimizedStrictGate(
        opt,
        post({ text: 'no animal here', langs: ['en'] }),
      ),
    ).toBe(false)
  })
})
