import { describe, expect, it } from 'vitest'
import { feedUriToBskyUrl } from './bsky-url'

describe('feedUriToBskyUrl', () => {
  it('does not encode DID colons in profile path', () => {
    const url = feedUriToBskyUrl(
      'at://did:plc:lptjvw6ut224kwrj7ub3sqbe/app.bsky.feed.generator/npftest',
    )
    expect(url).toBe(
      'https://bsky.app/profile/did:plc:lptjvw6ut224kwrj7ub3sqbe/feed/npftest',
    )
  })

  it('encodes handles', () => {
    const url = feedUriToBskyUrl(
      'at://alice.bsky.social/app.bsky.feed.generator/my-feed',
    )
    expect(url).toBe('https://bsky.app/profile/alice.bsky.social/feed/my-feed')
  })
})
