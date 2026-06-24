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
    hasImage: false,
    hasLinkCard: false,
    hasQuote: false,
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

  it('respects group logic for viewer rings', () => {
    const feed: FeedConfig = {
      feedId: 'f1',
      projectId: 'p1',
      name: 'test',
      enabled: true,
      poolScope: 'project_only',
      match: {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'follow_ring',
            id: 'v1',
            op: 'includes',
            hubSource: 'viewer',
            direction: 'follows',
          },
        ],
      },
    }
    expect(
      evaluateViewerFollowRingOverlay(post, feed.match, {
        v1: ['did:plc:author1'],
      }),
    ).toBe(true)
    expect(
      evaluateViewerFollowRingOverlay(post, feed.match, {
        v1: [],
      }),
    ).toBe(false)
  })
})
