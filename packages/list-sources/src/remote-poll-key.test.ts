import { describe, expect, it } from 'vitest'
import { remotePollKeyFromListSource } from './remote-poll-key.js'

describe('remotePollKeyFromListSource', () => {
  it('returns canonical at URI for list', () => {
    expect(
      remotePollKeyFromListSource({
        type: 'bluesky_list',
        uri: 'at://did:plc:abc/app.bsky.graph.list/xyz',
      }),
    ).toBe('at://did:plc:abc/app.bsky.graph.list/xyz')
  })

  it('normalizes https list URL to pending key when handle-based', () => {
    expect(
      remotePollKeyFromListSource({
        type: 'bluesky_list',
        uri: 'https://bsky.app/profile/alice.bsky.social/lists/abc123',
      }),
    ).toBe('pending:list:alice.bsky.social:abc123')
  })

  it('returns null for manual dids', () => {
    expect(
      remotePollKeyFromListSource({ type: 'manual_dids', dids: ['did:plc:x'] }),
    ).toBeNull()
  })
})
