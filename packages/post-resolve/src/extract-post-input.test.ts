import { describe, expect, it } from 'vitest'
import { extractPostInput } from './extract-post-input.js'

describe('extractPostInput', () => {
  it('accepts a plain bsky post URL', () => {
    const url = 'https://bsky.app/profile/alice.bsky.social/post/abc123'
    expect(extractPostInput(url)).toEqual({ ok: true, value: url, extracted: false })
  })

  it('extracts URL embedded in pasted text', () => {
    const url = 'https://bsky.app/profile/alice.bsky.social/post/abc123'
    const result = extractPostInput(`Check this out: ${url} — cool post`)
    expect(result).toEqual({ ok: true, value: url, extracted: true })
  })

  it('rejects internal API paths with a helpful message', () => {
    const result = extractPostInput('2. L1 ingestion (/api/feeds/npftest/preview)')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('API path')
    }
  })
})
