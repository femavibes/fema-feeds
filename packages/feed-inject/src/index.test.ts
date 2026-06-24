import { describe, expect, it } from 'vitest'
import { mergeInjectorSlots, urisFromNativeConfig } from './index.js'

describe('feed-inject', () => {
  it('merges injected URIs every N organic posts', () => {
    const organic = [{ post: 'at://a' }, { post: 'at://b' }, { post: 'at://c' }, { post: 'at://d' }]
    const merged = mergeInjectorSlots(organic, ['at://ad1'], { every: 2, maxPerPage: 2 })
    expect(merged.map((p) => p.post)).toEqual([
      'at://a',
      'at://b',
      'at://ad1',
      'at://c',
      'at://d',
      'at://ad1',
    ])
  })

  it('respects maxPerPage', () => {
    const organic = Array.from({ length: 20 }, (_, i) => ({ post: `at://p${i}` }))
    const merged = mergeInjectorSlots(organic, ['at://ad'], { every: 1, maxPerPage: 1 })
    const ads = merged.filter((p) => p.post === 'at://ad')
    expect(ads).toHaveLength(1)
  })

  it('reads native config uris', () => {
    expect(
      urisFromNativeConfig({ uris: ['at://ok', 'bad', 1] }),
    ).toEqual(['at://ok'])
  })
})
