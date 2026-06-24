import { describe, expect, it } from 'vitest'
import type { NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { evaluateMergedL1, evaluateProjectL1 } from './evaluate.js'

const basePost: NormalizedPost = {
  uri: 'at://did:plc:test/app.bsky.feed.post/1',
  cid: 'bafytest',
  authorDid: 'did:plc:author1',
  recordType: 'app.bsky.feed.post',
  text: 'hello springfield',
  createdAt: new Date().toISOString(),
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
  indexedAt: new Date().toISOString(),
}

describe('evaluateProjectL1', () => {
  it('video project rejects non-video before keywords run', () => {
    const config: ProjectL1Config = {
      projectId: 'video',
      name: 'Video',
      enabled: true,
      hasVideo: 'require',
      keywordInclude: { terms: ['springfield'], fields: ['text'] },
    }
    const result = evaluateProjectL1(basePost, config)
    expect(result.matched).toBe(false)
    expect(result.trace.map((t) => t.stepId)).not.toContain('keyword_include')
  })

  it('author fast-path bypasses language', () => {
    const config: ProjectL1Config = {
      projectId: 'news',
      name: 'News',
      enabled: true,
      language: { allow: ['en'], unknown: 'exclude' },
      authorLists: [
        {
          listId: 'reporters',
          dids: ['did:plc:author1'],
          fastPath: {
            enabled: true,
            bypassSteps: ['language', 'language_unknown', 'keyword_include'],
          },
        },
      ],
      keywordInclude: { terms: ['zzz'], fields: ['text'] },
    }
    const result = evaluateProjectL1({ ...basePost, langs: ['ja'] }, config)
    expect(result.matched).toBe(true)
    expect(result.matchedVia).toBe('author')
  })

  it('authorsOnly rejects non-listed authors', () => {
    const config: ProjectL1Config = {
      projectId: 'reporters-only',
      name: 'Reporters',
      enabled: true,
      authorsOnly: true,
      authorLists: [
        {
          listId: 'reporters',
          dids: ['did:plc:author1'],
          fastPath: { enabled: true, bypassSteps: ['language'] },
        },
      ],
    }
    const stranger = { ...basePost, authorDid: 'did:plc:stranger' }
    expect(evaluateProjectL1(stranger, config).matched).toBe(false)
    expect(evaluateProjectL1(basePost, config).matched).toBe(true)
  })

  it('feed-compiled projects only run ingest_gate (not legacy discovery steps)', () => {
    const config: ProjectL1Config = {
      projectId: 'feed-compiled',
      name: 'Feed',
      enabled: true,
      compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
      ingestGate: {
        includeBranches: [
          {
            type: 'all',
            rules: [
              {
                type: 'keyword',
                op: 'includes',
                terms: ['springfield'],
                fields: ['text'],
              },
              {
                type: 'language',
                allow: ['en'],
                unknown: 'exclude',
              },
            ],
          },
        ],
        excludeBranches: [],
      },
    }
    const result = evaluateProjectL1({ ...basePost, langs: ['ja'] }, config)
    expect(result.matched).toBe(false)
    expect(result.trace.map((t) => t.stepId)).toEqual(['ingest_gate'])
  })
})

describe('evaluateMergedL1', () => {
  it('post can match multiple projects', () => {
    const configs: ProjectL1Config[] = [
      {
        projectId: 'a',
        name: 'A',
        enabled: true,
        keywordInclude: { terms: ['springfield'], fields: ['text'] },
      },
      {
        projectId: 'b',
        name: 'B',
        enabled: true,
        language: { allow: ['en'], unknown: 'include' },
      },
    ]
    const result = evaluateMergedL1(basePost, configs)
    expect(result.projects.filter((p) => p.matched)).toHaveLength(2)
  })
})
