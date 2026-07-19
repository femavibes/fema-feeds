import { describe, expect, it } from 'vitest'
import type { FeedConfig, L2RuleGroup, NormalizedPost } from '@cfb/core-types'
import {
  evaluateViewerFollowRingOverlay,
  evaluateViewerFollowRingNode,
} from './viewer-overlay.js'

const post: NormalizedPost = {
  uri: 'at://a/post/1',
  cid: 'bafy',
  authorDid: 'did:plc:author1',
  recordType: 'app.bsky.feed.post',
  text: '',
  createdAt: '2024-01-01T00:00:00.000Z',
  langs: [],
  selfLabels: [],
  labelerLabels: [],
  postKind: 'root',
  embed: {
    hasVideo: false,
      hasGif: false,
    hasImage: false,
    hasLinkCard: false,
    hasQuote: false,
      hasQuoteWithMedia: false,
    hasRecord: false,
    hasTextOnly: true,
  },
  facetTags: [],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  indexedAt: '2024-01-01T00:00:00.000Z',
}

describe('evaluateViewerFollowRingOverlay', () => {
  it('passes account-hub nodes (already filtered at ingest)', () => {
    const match: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'follow_ring',
          id: 'r1',
          op: 'includes',
          hubSource: 'account',
          hub: 'hub.bsky.social',
          direction: 'followers',
        },
      ],
    }
    expect(
      evaluateViewerFollowRingOverlay(post, match, { r1: [] }),
    ).toBe(true)
  })

  it('filters viewer-hub includes ring', () => {
    const node = {
      type: 'follow_ring' as const,
      id: 'v1',
      op: 'includes' as const,
      hubSource: 'viewer' as const,
      direction: 'follows' as const,
    }
    expect(
      evaluateViewerFollowRingNode(post, node, { v1: ['did:plc:author1'] }),
    ).toBe(true)
    expect(
      evaluateViewerFollowRingNode(post, node, { v1: ['did:plc:other'] }),
    ).toBe(false)
  })

  it('does not let account-hub siblings auto-pass an any-group over a failing viewer ring', () => {
    // Canvas often stores account+viewer as flat `any` children until resolveFeedMatch.
    const match: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'follow_ring',
          id: 'account',
          op: 'includes',
          hubSource: 'account',
          hub: 'fema.monster',
          direction: 'followers',
        },
        {
          type: 'follow_ring',
          id: 'viewer',
          op: 'includes',
          hubSource: 'viewer',
          direction: 'followers',
        },
      ],
    }
    expect(
      evaluateViewerFollowRingOverlay(post, match, {
        account: [],
        viewer: ['did:plc:other'],
      }),
    ).toBe(false)
    expect(
      evaluateViewerFollowRingOverlay(post, match, {
        account: [],
        viewer: ['did:plc:author1'],
      }),
    ).toBe(true)
  })

  it('AND path: account pass-through + viewer filter', () => {
    const match: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'group',
          id: 'path',
          logic: 'all',
          children: [
            {
              type: 'follow_ring',
              id: 'account',
              op: 'includes',
              hubSource: 'account',
              hub: 'fema.monster',
              direction: 'followers',
            },
            {
              type: 'follow_ring',
              id: 'viewer',
              op: 'includes',
              hubSource: 'viewer',
              direction: 'followers',
            },
          ],
        },
      ],
    }
    expect(
      evaluateViewerFollowRingOverlay(post, match, { viewer: ['did:plc:author1'] }),
    ).toBe(true)
    expect(
      evaluateViewerFollowRingOverlay(post, match, { viewer: [] }),
    ).toBe(false)
  })
})
