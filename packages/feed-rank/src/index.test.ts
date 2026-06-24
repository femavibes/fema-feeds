import { describe, expect, it } from 'vitest'
import {
  applyPinnedUriRanker,
  pinnedUrisFromNativeConfig,
  validateRankerReorder,
} from './index.js'

describe('feed-rank', () => {
  it('pins configured URIs to the front', () => {
    const organic = [
      { post: 'at://a' },
      { post: 'at://b' },
      { post: 'at://c' },
      { post: 'at://d' },
    ]
    const ranked = applyPinnedUriRanker(organic, ['at://c', 'at://a'])
    expect(ranked.map((p) => p.post)).toEqual(['at://c', 'at://a', 'at://b', 'at://d'])
  })

  it('reads native pinnedUris config', () => {
    expect(pinnedUrisFromNativeConfig({ pinnedUris: ['at://ok', 'nope', 2] })).toEqual(['at://ok'])
  })

  it('validates remote reorder keeps all candidates', () => {
    const original = ['at://a', 'at://b', 'at://c']
    expect(validateRankerReorder(original, ['at://c', 'at://x', 'at://a'])).toEqual([
      'at://c',
      'at://a',
      'at://b',
    ])
  })
})
