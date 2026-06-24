import { describe, expect, it } from 'vitest'
import { subscribeLabelsUrl } from './resolve-endpoint.js'

describe('subscribeLabelsUrl', () => {
  it('builds ws URL with cursor', () => {
    const url = subscribeLabelsUrl('https://mod.bsky.app', 42)
    expect(url).toBe('wss://mod.bsky.app/xrpc/com.atproto.label.subscribeLabels?cursor=42')
  })

  it('omits cursor when zero', () => {
    const url = subscribeLabelsUrl('https://mod.bsky.app', 0)
    expect(url).toBe('wss://mod.bsky.app/xrpc/com.atproto.label.subscribeLabels')
  })
})
