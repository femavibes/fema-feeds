import { describe, expect, it, vi } from 'vitest'
import { fetchActorFollowersDids, fetchActorFollowsDids } from './follows.js'

describe('fetchActorFollowsDids', () => {
  it('paginates follows', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          follows: [{ did: 'did:plc:a' }, { did: 'did:plc:b' }],
          cursor: 'c2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          follows: [{ did: 'did:plc:c' }],
        }),
      })

    const dids = await fetchActorFollowsDids('did:plc:hub', { fetchImpl, maxActors: 10 })
    expect(dids).toEqual(['did:plc:a', 'did:plc:b', 'did:plc:c'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('fetchActorFollowersDids', () => {
  it('paginates followers', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        followers: [{ did: 'did:plc:fan' }],
      }),
    })

    const dids = await fetchActorFollowersDids('did:plc:hub', { fetchImpl })
    expect(dids).toEqual(['did:plc:fan'])
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('getFollowers')
  })
})
