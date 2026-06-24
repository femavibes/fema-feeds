import { describe, expect, it } from 'vitest'
import type { NormalizedPost } from './index.js'
import { collectSearchableText, textContainsAny, textMatchesRegex, compileRegex, collectPostUrls, urlMatchesAny } from './post-search.js'

const post: NormalizedPost = {
  uri: 'at://did:plc:x/app.bsky.feed.post/1',
  cid: 'bafy',
  authorDid: 'did:plc:x',
  recordType: 'app.bsky.feed.post',
  text: 'hello world',
  createdAt: '2026-01-01T00:00:00.000Z',
  langs: ['en'],
  selfLabels: [],
  labelerLabels: [],
  postKind: 'root',
  embed: {
    hasVideo: false,
    hasImage: true,
    hasLinkCard: false,
    hasQuote: false,
    hasRecord: false,
    hasTextOnly: false,
  },
  embedDetail: {
    images: [{ alt: 'sunset photo' }],
    external: { uri: 'https://x.com', title: 'Example Title', description: 'Example desc' },
  },
  facetTags: [],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  bridgyOriginalText: 'mastodon html',
  bridgyOriginalUrl: 'https://snarfed.org/x',
  indexedAt: '2026-01-01T00:00:00.000Z',
}

describe('collectSearchableText', () => {
  it('collects configured fields', () => {
    const haystack = collectSearchableText(post, [
      'text',
      'image_alt',
      'link_title',
      'link_description',
      'link_uri',
      'bridgy_original_text',
      'bridgy_original_url',
    ])
    expect(haystack).toContain('hello world')
    expect(haystack).toContain('sunset photo')
    expect(haystack).toContain('Example Title')
    expect(haystack).toContain('https://x.com')
    expect(haystack).toContain('mastodon html')
  })

  it('includes facet links when configured', () => {
    const withFacets = { ...post, facetLinks: ['https://example.com/path'] }
    const haystack = collectSearchableText(withFacets, ['facet_link'])
    expect(haystack).toContain('https://example.com/path')
  })
})

describe('collectPostUrls', () => {
  it('collects link card, facet, and bridgy URLs', () => {
    const urls = collectPostUrls(
      { ...post, facetLinks: ['https://facet.example'] },
      ['link_card', 'facet_link', 'bridgy_original'],
    )
    expect(urls).toContain('https://x.com')
    expect(urls).toContain('https://facet.example')
    expect(urls).toContain('https://snarfed.org/x')
  })

  it('matches patterns against individual URLs', () => {
    const urls = collectPostUrls(post, ['link_card'])
    expect(urlMatchesAny(urls, ['x.com'])).toBe(true)
    expect(urlMatchesAny(urls, ['nytimes'])).toBe(false)
  })
})

describe('textContainsAny', () => {
  it('matches case-insensitive substrings without word boundaries by default', () => {
    expect(textContainsAny('hotdog stand', ['dog'])).toBe(true)
    expect(textContainsAny('hotdog stand', ['stand'])).toBe(true)
    expect(textContainsAny('hotdog stand', ['cat'])).toBe(false)
  })

  it('respects case sensitivity', () => {
    expect(textContainsAny('Hello World', ['hello'], { caseSensitive: true })).toBe(false)
    expect(textContainsAny('Hello World', ['Hello'], { caseSensitive: true })).toBe(true)
  })

  it('respects whole word boundaries', () => {
    expect(textContainsAny('hotdog stand', ['dog'], { wholeWord: true })).toBe(false)
    expect(textContainsAny('big dog energy', ['dog'], { wholeWord: true })).toBe(true)
  })
})

describe('textMatchesRegex', () => {
  it('matches patterns across haystack', () => {
    expect(textMatchesRegex('bike lane and transit', 'bike|transit')).toBe(true)
    expect(textMatchesRegex('bike lane and transit', '\\bbike\\b')).toBe(true)
    expect(textMatchesRegex('hotdog', '\\bdog\\b')).toBe(false)
  })
})

describe('compileRegex', () => {
  it('returns error for invalid patterns', () => {
    const result = compileRegex('[unclosed', true)
    expect('error' in result).toBe(true)
  })
})
