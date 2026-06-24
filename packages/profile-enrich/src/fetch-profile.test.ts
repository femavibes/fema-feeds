import { describe, expect, it } from 'vitest'
import { mapProfileResponse } from './fetch-profile.js'

describe('mapProfileResponse', () => {
  it('maps public API profile shape', () => {
    const p = mapProfileResponse({
      did: 'did:plc:test',
      handle: 'user.bsky.social',
      displayName: 'User',
      followersCount: 100,
      followsCount: 50,
      postsCount: 10,
      labels: [{ val: 'porn' }],
      createdAt: '2024-01-01T00:00:00.000Z',
    })
    expect(p.did).toBe('did:plc:test')
    expect(p.followersCount).toBe(100)
    expect(p.labels).toEqual(['porn'])
  })
})
