import { describe, expect, it } from 'vitest'
import type { NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { evaluateProjectL1 } from './evaluate.js'

const basePost: NormalizedPost = {
  uri: 'at://a/post/1',
  cid: 'bafy',
  authorDid: 'did:plc:member1',
  recordType: 'app.bsky.feed.post',
  text: 'hello',
  createdAt: '2024-01-01T00:00:00.000Z',
  langs: ['en'],
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

const project: ProjectL1Config = {
  projectId: 'p1',
  name: 'Test',
  enabled: true,
  followRing: {
    hubSource: 'account',
    hub: 'hub.bsky.social',
    direction: 'followers',
    op: 'includes',
  },
}

describe('L1 follow_ring', () => {
  it('passes when author is in cached account ring', () => {
    const result = evaluateProjectL1(basePost, project, {
      accountFollowRings: { p1: ['did:plc:member1'] },
    })
    expect(result.matched).toBe(true)
    expect(result.trace.some((t) => t.stepId === 'follow_ring' && t.outcome === 'pass')).toBe(true)
  })

  it('fails when author is not in cached account ring', () => {
    const result = evaluateProjectL1(basePost, project, {
      accountFollowRings: { p1: ['did:plc:other'] },
    })
    expect(result.matched).toBe(false)
  })

  it('defers viewer-hub ring at ingest', () => {
    const viewerProject: ProjectL1Config = {
      ...project,
      followRing: {
        hubSource: 'viewer',
        direction: 'follows',
        op: 'includes',
      },
    }
    const result = evaluateProjectL1(basePost, viewerProject)
    expect(result.matched).toBe(true)
    expect(result.trace.some((t) => t.detail?.includes('skeleton'))).toBe(true)
  })
})
