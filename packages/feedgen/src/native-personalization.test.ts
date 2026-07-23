import { describe, expect, it } from 'vitest'
import { DEFAULT_PERSONALIZATION } from '@cfb/core-types'
import { applyNativePersonalization, type ViewerPersonalizationContext } from './native-personalization.js'

function viewerWithServed(
  postUri: string,
  opts: { serveCount?: number; hoursAgoServed?: number; hoursAgoViewed?: number | null },
): ViewerPersonalizationContext {
  const servedAt = new Date(Date.now() - (opts.hoursAgoServed ?? 1) * 60 * 60 * 1000)
  const viewedAt = opts.hoursAgoViewed != null
    ? new Date(Date.now() - opts.hoursAgoViewed * 60 * 60 * 1000)
    : null
  return {
    viewerDid: 'did:plc:viewer',
    followedDids: new Set(),
    followerDids: new Set(),
    mutualDids: new Set(),
    servedPosts: new Map([
      [postUri, {
        serveCount: opts.serveCount ?? 2,
        servedAt,
        viewedAt,
      }],
    ]),
    affinityCounts: new Map(),
    hoursSinceLastOpen: null,
  }
}

describe('applyNativePersonalization suppressServed', () => {
  const posts = [{ post: 'at://did:plc:author/app.bsky.feed.post/abc' }]

  it('demotes served posts when penalty is below 1', () => {
    const viewer = viewerWithServed(posts[0]!.post, { serveCount: 2 })
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressServed: { enabled: true, penalty: 0.4, windowHours: 48 },
    }
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

  it('reads legacy suppressSeen config key', () => {
    const viewer = viewerWithServed(posts[0]!.post, { serveCount: 2 })
    const { suppressServed: _ignored, ...base } = DEFAULT_PERSONALIZATION
    const config = {
      ...base,
      suppressSeen: { enabled: true, penalty: 0.4, windowHours: 48 },
    }
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
    const viewer = viewerWithServed(posts[0]!.post, { serveCount: 2 })
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressServed: { enabled: true, penalty: 1, windowHours: 48 },
    }
    const sortKeys = new Map([[posts[0]!.post, 100]])

    const result = applyNativePersonalization(posts, config, viewer, sortKeys)
    expect(result[0]?.post).toBe(posts[0]!.post)
  })

  it('ignores served posts outside the window', () => {
    const viewer = viewerWithServed(posts[0]!.post, { serveCount: 2, hoursAgoServed: 72 })
    const config = {
      ...DEFAULT_PERSONALIZATION,
      suppressServed: { enabled: true, penalty: 0.1, windowHours: 48 },
    }
    const sortKeys = new Map([[posts[0]!.post, 100]])

    const result = applyNativePersonalization(posts, config, viewer, sortKeys)
    expect(result[0]?.post).toBe(posts[0]!.post)
  })
})

describe('personalization formula viewer graph fields', () => {
  it('is_follower is distinct from is_followed and is_mutual', async () => {
    const { evalPersonalizationFormula } = await import('./personalization-eval.js')
    const postUri = 'at://did:plc:author/app.bsky.feed.post/abc'
    const viewer: import('./native-personalization.js').ViewerPersonalizationContext = {
      viewerDid: 'did:plc:viewer',
      followedDids: new Set(['did:plc:author', 'did:plc:both']),
      followerDids: new Set(['did:plc:fan', 'did:plc:both']),
      mutualDids: new Set(['did:plc:both']),
      servedPosts: new Map(),
      affinityCounts: new Map(),
      hoursSinceLastOpen: null,
    }
    const authorPost = { postUri, authorDid: 'did:plc:author', baseScore: 1 }
    const fanPost = { postUri: 'at://did:plc:fan/app.bsky.feed.post/x', authorDid: 'did:plc:fan', baseScore: 1 }
    const mutualPost = { postUri: 'at://did:plc:both/app.bsky.feed.post/y', authorDid: 'did:plc:both', baseScore: 1 }

    expect(evalPersonalizationFormula({ type: 'field', field: 'is_followed' as never }, viewer, authorPost)).toBe(1)
    expect(evalPersonalizationFormula({ type: 'field', field: 'is_follower' as never }, viewer, authorPost)).toBe(0)
    expect(evalPersonalizationFormula({ type: 'field', field: 'is_mutual' as never }, viewer, authorPost)).toBe(0)

    expect(evalPersonalizationFormula({ type: 'field', field: 'is_follower' as never }, viewer, fanPost)).toBe(1)
    expect(evalPersonalizationFormula({ type: 'field', field: 'is_followed' as never }, viewer, fanPost)).toBe(0)

    expect(evalPersonalizationFormula({ type: 'field', field: 'is_mutual' as never }, viewer, mutualPost)).toBe(1)
    expect(evalPersonalizationFormula({ type: 'field', field: 'is_follower' as never }, viewer, mutualPost)).toBe(1)
    expect(evalPersonalizationFormula({ type: 'field', field: 'is_followed' as never }, viewer, mutualPost)).toBe(1)
  })
})

describe('personalization formula served vs viewed fields', () => {
  it('was_viewed is available separately from times_served', async () => {
    const { evalPersonalizationFormula } = await import('./personalization-eval.js')
    const postUri = 'at://did:plc:author/app.bsky.feed.post/abc'
    const viewer = viewerWithServed(postUri, { serveCount: 3, hoursAgoViewed: 2 })
    const postCtx = { postUri, authorDid: 'did:plc:author', baseScore: 10 }

    expect(evalPersonalizationFormula(
      { type: 'field', field: 'times_served' as never },
      viewer,
      postCtx,
    )).toBe(3)

    expect(evalPersonalizationFormula(
      { type: 'field', field: 'was_viewed' as never },
      viewer,
      postCtx,
    )).toBe(1)

    const notViewed = viewerWithServed(postUri, { serveCount: 3, hoursAgoViewed: null })
    expect(evalPersonalizationFormula(
      { type: 'field', field: 'was_viewed' as never },
      notViewed,
      postCtx,
    )).toBe(0)
  })
})
