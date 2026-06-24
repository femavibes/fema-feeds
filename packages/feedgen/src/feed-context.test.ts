import { describe, expect, it } from 'vitest'
import { encodeFeedContext, parseFeedContext } from './feed-context.js'

describe('feed-context', () => {
  it('round-trips feedContext', () => {
    const encoded = encodeFeedContext('my-feed', 'req-123', 4)
    expect(parseFeedContext(encoded)).toEqual({
      feedId: 'my-feed',
      reqId: 'req-123',
      position: 4,
    })
  })

  it('rejects unknown formats', () => {
    expect(parseFeedContext(undefined)).toBeNull()
    expect(parseFeedContext('legacy')).toBeNull()
  })
})
