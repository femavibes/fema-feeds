import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONALIZATION } from '@cfb/core-types'
import { applyNativePersonalization, type ViewerPersonalizationContext } from './native-personalization.js'

function viewerWithSeen(postUri: string, hoursAgo: number): ViewerPersonalizationContext {
  return {
    viewerDid: 'did:plc:viewer',
    followedDids: new Set(),
    mutualDids: new Set(),
    seenPosts: new Map([
      [postUri, {
        impressionCount: 2,
        servedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      }],
    ]),
    affinityCounts: new Map(),
    hoursSinceLastOpen: null,
  }
}

describe('applyNativePersonalization suppressSeen', () => {
  const posts = [{ post: 'at://did:plc:author/app.bsky.feed.post/abc' }]

  it('demotes seen posts when penalty is below 1', () => {
    const viewer = viewerWithSeen(posts[0]!.post, 1)
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressSeen: { enabled: true, penalty: 0.4, windowHours: 48 },
    }
    const sortKeys = new Map([[posts[0]!.post, 100]])
    const unseen = [{ post: 'at://did:plc:other/app.bsky.feed.post/xyz' }]
    const sortKeys2 = new Map([
      [posts[0]!.post, 100],
      [unseen[0]!.post, 99],
    ])

    const result = applyNativePersonalization(
      [...posts, ...unseen],
      config,
      viewer,
      sortKeys2,
    )
    expect(result[0]?.post).toBe(unseen[0]!.post)
  })

  it('does not demote when penalty is 1 (no-op multiplier)', () => {
    const viewer = viewerWithSeen(posts[0]!.post, 1)
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressSeen: { enabled: true, penalty: 1, windowHours: 48 },
    }
    const sortKeys = new Map([[posts[0]!.post, 100]])

    const result = applyNativePersonalization(posts, config, viewer, sortKeys)
    expect(result[0]?.post).toBe(posts[0]!.post)
  })

  it('ignores seen posts outside the window', () => {
    const viewer = viewerWithSeen(posts[0]!.post, 72)
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressSeen: { enabled: true, penalty: 0.1, windowHours: 48 },
    }
    const sortKeys = new Map([[posts[0]!.post, 100]])

    const result = applyNativePersonalization(posts, config, viewer, sortKeys)
    expect(result[0]?.post).toBe(posts[0]!.post)
  })
})
