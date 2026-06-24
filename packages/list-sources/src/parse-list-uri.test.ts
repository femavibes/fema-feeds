import { describe, expect, it } from 'vitest'
import { parseGraphUri, parseListUri, isGraphUri } from './parse-list-uri.js'

describe('parseGraphUri', () => {
  it('parses at:// list URI', () => {
    const r = parseGraphUri('at://did:plc:abc/app.bsky.graph.list/3jx7ytmdc2g2z')
    expect(r?.kind).toBe('list')
    expect(r?.atUri).toBe('at://did:plc:abc/app.bsky.graph.list/3jx7ytmdc2g2z')
  })

  it('parses at:// starter pack URI', () => {
    const r = parseGraphUri('at://did:plc:abc/app.bsky.graph.starterpack/3jxabc')
    expect(r?.kind).toBe('starterpack')
  })

  it('parses https bsky.app list with did actor', () => {
    const r = parseGraphUri(
      'https://bsky.app/profile/did:plc:lptjvw6ut224kwrj7ub3sqbe/lists/3jzff4ob3xq2o',
    )
    expect(r?.atUri).toBe(
      'at://did:plc:lptjvw6ut224kwrj7ub3sqbe/app.bsky.graph.list/3jzff4ob3xq2o',
    )
  })

  it('parses https starter-pack URL', () => {
    const r = parseGraphUri('https://bsky.app/starter-pack/did:plc:abc/3jxabc')
    expect(r?.kind).toBe('starterpack')
  })

  it('rejects invalid URLs', () => {
    expect(isGraphUri('https://example.com')).toBe(false)
  })
})

describe('parseListUri legacy', () => {
  it('still works for lists', () => {
    expect(parseListUri('at://did:plc:abc/app.bsky.graph.list/3jx')?.listAtUri).toContain('list')
  })
})
