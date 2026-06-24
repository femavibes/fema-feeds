import { describe, expect, it } from 'vitest'
import type { NormalizedPost } from '@cfb/core-types'
import { evaluateProjectL1 } from './evaluate.js'

const post: NormalizedPost = {
  uri: 'at://a/post/1',
  cid: 'bafy',
  authorDid: 'did:plc:author1',
  recordType: 'app.bsky.feed.post',
  text: 'love transit maps',
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
  facetTags: ['maps'],
  hiddenFacetTags: [],
  facetLinks: [],
  facetMentions: [],
  outlineTags: [],
  indexedAt: '2024-01-01T00:00:00.000Z',
}

describe('compiled ingest_gate', () => {
  it('passes when any include branch matches (OR)', () => {
    const result = evaluateProjectL1(
      post,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: {
          includeBranches: [
            {
              type: 'keyword',
              op: 'includes',
              terms: ['crypto'],
              fields: ['text'],
            },
            {
              type: 'hashtag',
              op: 'includes',
              tags: ['maps'],
            },
          ],
          excludeBranches: [],
        },
      },
      {},
    )
    expect(result.matched).toBe(true)
  })

  it('requires all branches in an AND group', () => {
    const listedAuthor = { ...post, authorDid: 'did:plc:vip' }
    const gate = {
      includeBranches: [
        {
          type: 'all' as const,
          rules: [
            {
              type: 'author' as const,
              op: 'in_list' as const,
              listId: 'vip',
            },
            {
              type: 'keyword' as const,
              op: 'includes' as const,
              terms: ['breaking'],
              fields: ['text' as const],
            },
          ],
        },
      ],
      excludeBranches: [],
    }
    const extras = {
      ingestGateExtrasByProject: {
        p1: { authorListDids: { vip: ['did:plc:vip'] } },
      },
    }

    const noKeyword = evaluateProjectL1(
      listedAuthor,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      extras,
    )
    expect(noKeyword.matched).toBe(false)

    const both = evaluateProjectL1(
      { ...listedAuthor, text: 'breaking news' },
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      extras,
    )
    expect(both.matched).toBe(true)
  })

  it('evaluates nested ALL with ANY like feed logic', () => {
    const listedAuthor = { ...post, authorDid: 'did:plc:vip', text: 'GAGA and FISH' }
    const gate = {
      includeBranches: [
        {
          type: 'all' as const,
          rules: [
            {
              type: 'all' as const,
              rules: [
                { type: 'author' as const, op: 'in_list' as const, listId: 'vip' },
                {
                  type: 'any' as const,
                  rules: [
                    {
                      type: 'keyword' as const,
                      op: 'includes' as const,
                      terms: ['GAGA'],
                      fields: ['text' as const],
                    },
                  ],
                },
              ],
            },
            {
              type: 'keyword' as const,
              op: 'includes' as const,
              terms: ['FISH'],
              fields: ['text' as const],
            },
          ],
        },
      ],
      excludeBranches: [],
    }
    const extras = {
      ingestGateExtrasByProject: {
        p1: { authorListDids: { vip: ['did:plc:vip'] } },
      },
    }

    const gagaOnly = evaluateProjectL1(
      { ...listedAuthor, text: 'GAGA hello' },
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      extras,
    )
    expect(gagaOnly.matched).toBe(false)

    const full = evaluateProjectL1(
      listedAuthor,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      extras,
    )
    expect(full.matched).toBe(true)
  })

  it('authorsOnly blocks strangers even when a keyword branch would match', () => {
    const stranger = { ...post, authorDid: 'did:plc:stranger', text: 'love transit maps' }
    const result = evaluateProjectL1(
      stranger,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        authorsOnly: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: {
          includeBranches: [
            {
              type: 'author',
              op: 'in_list',
              listId: 'vip',
            },
            {
              type: 'hashtag',
              op: 'includes',
              tags: ['maps'],
            },
          ],
          excludeBranches: [],
        },
      },
      {
        ingestGateExtrasByProject: {
          p1: { authorListDids: { vip: ['did:plc:vip'] } },
        },
      },
    )
    expect(result.matched).toBe(false)
  })

  it('fails when no live feeds (legacy feed compile)', () => {
    const result = evaluateProjectL1(
      post,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', source: 'feeds', liveFeedIds: [] },
        ingestGate: { includeBranches: [], excludeBranches: [] },
      },
      {},
    )
    expect(result.matched).toBe(false)
  })

  it('prefilter compile with empty gate passes without live feeds', () => {
    const result = evaluateProjectL1(
      post,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', source: 'prefilter' },
        ingestGate: { includeBranches: [], excludeBranches: [] },
        prefilter: {
          match: { type: 'group', id: 'root', logic: 'any', children: [] },
        },
      },
      {},
    )
    expect(result.matched).toBe(true)
  })

  it('requires all project-wide restrictBranches even when a discovery path matches', () => {
    const japaneseFish = { ...post, text: 'FISH', langs: ['ja'] }
    const gate = {
      includeBranches: [
        {
          type: 'keyword' as const,
          op: 'includes' as const,
          terms: ['FISH'],
          fields: ['text' as const],
        },
      ],
      excludeBranches: [],
      restrictBranches: [
        {
          type: 'language' as const,
          allow: ['en'],
          unknown: 'exclude' as const,
        },
      ],
    }

    const result = evaluateProjectL1(
      japaneseFish,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      {},
    )
    expect(result.matched).toBe(false)

    const englishFish = { ...post, text: 'FISH', langs: ['en'] }
    const pass = evaluateProjectL1(
      englishFish,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      {},
    )
    expect(pass.matched).toBe(true)
  })

  it('allows OR paths when language is path-local not project-wide', () => {
    const englishFafa = { ...post, text: 'fafa hello', langs: ['en'] }
    const gate = {
      includeBranches: [
        {
          type: 'any' as const,
          rules: [
            { type: 'language' as const, allow: ['es'], unknown: 'exclude' as const },
            {
              type: 'keyword' as const,
              op: 'includes' as const,
              terms: ['fafa'],
              fields: ['text' as const],
            },
          ],
        },
      ],
      excludeBranches: [],
    }

    const result = evaluateProjectL1(
      englishFafa,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: { compiledAt: '2024-01-01', liveFeedIds: ['f1'] },
        ingestGate: gate,
      },
      {},
    )
    expect(result.matched).toBe(true)
  })
})
