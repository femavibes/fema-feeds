import { describe, expect, it } from 'vitest'
import { atProtoUriToBskyWebUrl, bskyWebHref, bskyProfileSegment } from './bsky-web-url'

describe('bsky-web-url', () => {
  it('leaves did: actors unencoded in post URLs', () => {
    expect(
      atProtoUriToBskyWebUrl(
        'at://did:plc:abc/app.bsky.feed.post/3lsk4jpw6bg2h',
      ),
    ).toBe('https://bsky.app/profile/did:plc:abc/post/3lsk4jpw6bg2h')
  })

  it('leaves did: actors unencoded in list URLs', () => {
    expect(
      atProtoUriToBskyWebUrl(
        'at://did:plc:3wh3o5qteklqxtz4d4iz3taq/app.bsky.graph.list/3lsk4jpw6bg2h',
      ),
    ).toBe(
      'https://bsky.app/profile/did:plc:3wh3o5qteklqxtz4d4iz3taq/lists/3lsk4jpw6bg2h',
    )
  })

  it('keeps did: profile segments raw', () => {
    expect(bskyProfileSegment('alice.bsky.social')).toBe('alice.bsky.social')
    expect(bskyProfileSegment('did:plc:xyz')).toBe('did:plc:xyz')
  })

  it('never returns at:// from bskyWebHref', () => {
    expect(bskyWebHref('at://did:plc:x/app.bsky.feed.post/yyy').startsWith('https://')).toBe(
      true,
    )
    expect(bskyWebHref('not-a-uri')).toBe('https://bsky.app')
  })

  it('passes through https URLs', () => {
    const u = 'https://bsky.app/profile/alice.bsky.social/lists/3abc'
    expect(atProtoUriToBskyWebUrl(u)).toBe(u)
  })
})
