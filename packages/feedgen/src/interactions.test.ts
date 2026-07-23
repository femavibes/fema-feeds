import { describe, expect, it } from 'vitest'
import {
  feedIdFromFeedParam,
  resolveInteractionEvent,
} from './interactions.js'

describe('resolveInteractionEvent', () => {
  it('reads event field', () => {
    expect(
      resolveInteractionEvent({
        event: 'app.bsky.feed.defs#interactionSeen',
      }),
    ).toBe('app.bsky.feed.defs#interactionSeen')
  })

  it('reads $type when event is missing', () => {
    expect(
      resolveInteractionEvent({
        $type: 'app.bsky.feed.defs#interactionSeen',
        item: 'at://did:plc:a/app.bsky.feed.post/1',
      }),
    ).toBe('app.bsky.feed.defs#interactionSeen')
  })

  it('ignores generic interaction $type without event', () => {
    expect(
      resolveInteractionEvent({
        $type: 'app.bsky.feed.defs#interaction',
      }),
    ).toBeUndefined()
  })
})

describe('feedIdFromFeedParam', () => {
  it('parses feed slug from at-uri', () => {
    expect(
      feedIdFromFeedParam(
        'at://did:plc:lptjvw6ut224kwrj7ub3sqbe/app.bsky.feed.generator/up-fyp-test',
      ),
    ).toBe('up-fyp-test')
  })
})
