import { describe, it, expect } from 'vitest'
import { tokenize, extractUnigrams, extractBigrams, extractTrigrams, extractNgrams } from './ngrams.js'
import { extractSignals } from './extract.js'
import { SignalCounter, PoolCounterSet } from './counters.js'
import { computeConfidence } from './compute.js'
import type { NormalizedPost } from '@cfb/core-types'

function makePost(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    uri: 'at://did:plc:test/app.bsky.feed.post/1',
    cid: 'cid1',
    authorDid: 'did:plc:test',
    recordType: 'app.bsky.feed.post',
    text: '',
    createdAt: '2024-01-01T00:00:00Z',
    langs: ['en'],
    selfLabels: [],
    labelerLabels: [],
    postKind: 'root',
    embed: { hasVideo: false,
      hasGif: false, hasImage: false, hasLinkCard: false, hasQuote: false,
      hasQuoteWithMedia: false, hasRecord: false, hasTextOnly: true },
    facetTags: [],
    hiddenFacetTags: [],
    facetLinks: [],
    facetMentions: [],
    outlineTags: [],
    indexedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('tokenize', () => {
  it('lowercases and extracts 3+ char words', () => {
    expect(tokenize('Hello World! This is a Test.')).toEqual(['hello', 'world', 'this', 'test'])
  })

  it('strips URLs and mentions', () => {
    expect(tokenize('Check https://example.com and @user.bsky.social for info')).toEqual(['check', 'and', 'for', 'info'])
  })

  it('handles empty text', () => {
    expect(tokenize('')).toEqual([])
  })
})

describe('extractUnigrams', () => {
  it('filters stop words', () => {
    const tokens = ['bike', 'lane', 'the', 'city', 'and', 'zoning']
    expect(extractUnigrams(tokens, 'en')).toEqual(['bike', 'lane', 'city', 'zoning'])
  })
})

describe('extractBigrams', () => {
  it('keeps bigrams with at least one non-stop word', () => {
    const tokens = ['bike', 'lane', 'the', 'city']
    const bigrams = extractBigrams(tokens, 'en')
    expect(bigrams).toContain('bike lane')
    expect(bigrams).toContain('lane the')
    expect(bigrams).toContain('the city')
  })

  it('filters bigrams where both are stop words', () => {
    const tokens = ['the', 'and', 'bike']
    const bigrams = extractBigrams(tokens, 'en')
    expect(bigrams).not.toContain('the and')
    expect(bigrams).toContain('and bike')
  })
})

describe('extractTrigrams', () => {
  it('keeps trigrams with at least one meaningful word', () => {
    const tokens = ['mixed', 'use', 'zoning', 'reform']
    const trigrams = extractTrigrams(tokens, 'en')
    expect(trigrams).toContain('mixed use zoning')
    expect(trigrams).toContain('use zoning reform')
  })
})

describe('extractNgrams', () => {
  it('produces unigrams + bigrams + trigrams from text', () => {
    const result = extractNgrams('bike lane zoning reform', 'en')
    expect(result).toContain('bike')
    expect(result).toContain('zoning')
    expect(result).toContain('bike lane')
    expect(result).toContain('zoning reform')
    expect(result).toContain('bike lane zoning')
    expect(result).toContain('lane zoning reform')
  })
})

describe('extractSignals', () => {
  it('extracts hashtags', () => {
    const post = makePost({ facetTags: ['Urbanism', 'FuckCars'] })
    const signals = extractSignals(post, 'en')
    const hashtags = signals.filter((s) => s.type === 'hashtag')
    expect(hashtags).toEqual([
      { type: 'hashtag', value: 'urbanism' },
      { type: 'hashtag', value: 'fuckcars' },
    ])
  })

  it('extracts mentions', () => {
    const post = makePost({ facetMentions: ['did:plc:abc'] })
    const signals = extractSignals(post, 'en')
    expect(signals).toContainEqual({ type: 'mention', value: 'did:plc:abc' })
  })

  it('extracts domains from facet links', () => {
    const post = makePost({ facetLinks: ['https://www.strongtowns.org/article'] })
    const signals = extractSignals(post, 'en')
    expect(signals).toContainEqual({ type: 'domain', value: 'strongtowns.org' })
  })

  it('skips bsky.app domain', () => {
    const post = makePost({ facetLinks: ['https://bsky.app/profile/test'] })
    const signals = extractSignals(post, 'en')
    const domains = signals.filter((s) => s.type === 'domain')
    expect(domains).toEqual([])
  })

  it('extracts engaged accounts from reply', () => {
    const post = makePost({ reply: { parentUri: 'at://did:plc:parent/app.bsky.feed.post/1' } })
    const signals = extractSignals(post, 'en')
    expect(signals).toContainEqual({ type: 'engaged_account', value: 'did:plc:parent' })
  })

  it('extracts n-grams from text', () => {
    const post = makePost({ text: 'Protected bike lanes save lives' })
    const signals = extractSignals(post, 'en')
    const ngrams = signals.filter((s) => s.type === 'ngram')
    expect(ngrams.map((s) => s.value)).toContain('bike')
    expect(ngrams.map((s) => s.value)).toContain('protected bike')
  })
})

describe('SignalCounter', () => {
  it('counts signals and dedupes within a post', () => {
    const counter = new SignalCounter()
    counter.record([
      { type: 'hashtag', value: 'test' },
      { type: 'hashtag', value: 'test' }, // dupe
      { type: 'hashtag', value: 'other' },
    ])
    expect(counter.totalPosts).toBe(1)
    const all = counter.all()
    expect(all.find((e) => e.value === 'test')?.count).toBe(1)
    expect(all.find((e) => e.value === 'other')?.count).toBe(1)
  })

  it('accumulates across posts', () => {
    const counter = new SignalCounter()
    counter.record([{ type: 'hashtag', value: 'test' }])
    counter.record([{ type: 'hashtag', value: 'test' }])
    counter.record([{ type: 'hashtag', value: 'other' }])
    expect(counter.totalPosts).toBe(3)
    const all = counter.all()
    expect(all.find((e) => e.value === 'test')?.count).toBe(2)
  })

  it('flush returns snapshot and resets', () => {
    const counter = new SignalCounter()
    counter.record([{ type: 'hashtag', value: 'x' }])
    const snap = counter.flush()
    expect(snap.totalPosts).toBe(1)
    expect(snap.entries.length).toBe(1)
    expect(counter.totalPosts).toBe(0)
    expect(counter.size).toBe(0)
  })

  it('topK returns highest counts', () => {
    const counter = new SignalCounter()
    for (let i = 0; i < 10; i++) counter.record([{ type: 'hashtag', value: 'rare' }])
    for (let i = 0; i < 100; i++) counter.record([{ type: 'hashtag', value: 'common' }])
    const top = counter.topK(1)
    expect(top[0]?.value).toBe('common')
  })
})

describe('PoolCounterSet', () => {
  it('manages per-project counters', () => {
    const set = new PoolCounterSet()
    set.getOrCreate('proj1').record([{ type: 'hashtag', value: 'a' }])
    set.getOrCreate('proj2').record([{ type: 'hashtag', value: 'b' }])
    const flushed = set.flushAll()
    expect(flushed.size).toBe(2)
    expect(flushed.get('proj1')!.entries[0]?.value).toBe('a')
  })
})

describe('computeConfidence', () => {
  it('returns log2(count+1) * lift', () => {
    // 16 occurrences, 5x lift → log2(17) * 5 ≈ 20.4
    const c = computeConfidence(16, 5)
    expect(c).toBeCloseTo(Math.log2(17) * 5, 1)
  })

  it('higher count with same lift increases confidence', () => {
    expect(computeConfidence(1, 5)).toBeLessThan(computeConfidence(16, 5))
  })
})
