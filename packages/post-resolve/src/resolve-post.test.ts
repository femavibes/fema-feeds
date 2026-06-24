import { describe, expect, it, vi } from 'vitest'
import { parsePostUri } from './parse-post-uri.js'
import { resolvePostInput } from './resolve-post.js'

describe('parsePostUri', () => {
  it('parses at:// post URI', () => {
    const r = parsePostUri('at://did:plc:abc/app.bsky.feed.post/3jx7ytmdc2g2z')
    expect(r?.atUri).toBe('at://did:plc:abc/app.bsky.feed.post/3jx7ytmdc2g2z')
  })

  it('parses https bsky.app post with did actor', () => {
    const r = parsePostUri(
      'https://bsky.app/profile/did:plc:abc/post/3jx7ytmdc2g2z',
    )
    expect(r?.atUri).toBe('at://did:plc:abc/app.bsky.feed.post/3jx7ytmdc2g2z')
  })

  it('parses https bsky.app post with handle (needs resolve)', () => {
    const r = parsePostUri('https://bsky.app/profile/alice.bsky.social/post/3jxabc')
    expect(r?.resolveActor?.actor).toBe('alice.bsky.social')
    expect(r?.resolveActor?.rkey).toBe('3jxabc')
  })

  it('rejects invalid input', () => {
    expect(parsePostUri('https://example.com')).toBeNull()
  })
})

describe('resolvePostInput', () => {
  it('fetches and normalizes via mocked API', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('getProfile')) {
        return new Response(JSON.stringify({ did: 'did:plc:alice' }), { status: 200 })
      }
      if (u.includes('getPosts')) {
        return new Response(
          JSON.stringify({
            posts: [
              {
                uri: 'at://did:plc:alice/app.bsky.feed.post/3jxabc',
                cid: 'bafytest',
                author: { did: 'did:plc:alice' },
                record: { text: 'hello world', langs: ['en'] },
                indexedAt: '2026-06-17T12:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 404 })
    })

    const post = await resolvePostInput(
      'https://bsky.app/profile/alice.bsky.social/post/3jxabc',
      { fetch: fetchMock as typeof fetch, publicApiBase: 'https://api.test' },
    )

    expect(post.authorDid).toBe('did:plc:alice')
    expect(post.text).toBe('hello world')
  })
})
