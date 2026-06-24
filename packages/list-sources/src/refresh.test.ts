import { describe, expect, it, vi } from 'vitest'
import { refreshAuthorList } from './refresh.js'

describe('refreshAuthorList', () => {
  it('resolves bluesky list via injected fetch', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('getList')) {
        return new Response(
          JSON.stringify({
            items: [{ subject: { did: 'did:plc:member1' } }, { subject: 'did:plc:member2' }],
          }),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 404 })
    })

    const out = await refreshAuthorList(
      {
        listId: 'test',
        sources: [{ type: 'bluesky_list', uri: 'at://did:plc:owner/app.bsky.graph.list/abc' }],
        fastPath: { enabled: false, bypassSteps: [] },
      },
      { fetch: fetchMock as typeof fetch, publicApiBase: 'https://api.test' },
    )

    expect(out.dids).toEqual(['did:plc:member1', 'did:plc:member2'])
    expect(fetchMock).toHaveBeenCalled()
  })

  it('keeps prior dids when refresh fails', async () => {
    const fetchMock = vi.fn(async () => new Response('fail', { status: 500 }))
    const out = await refreshAuthorList(
      {
        listId: 'test',
        dids: ['did:plc:stale'],
        sources: [{ type: 'bluesky_list', uri: 'at://did:plc:owner/app.bsky.graph.list/abc' }],
        fastPath: { enabled: false, bypassSteps: [] },
      },
      { fetch: fetchMock as typeof fetch, publicApiBase: 'https://api.test' },
    )
    expect(out.dids).toEqual(['did:plc:stale'])
  })
})
