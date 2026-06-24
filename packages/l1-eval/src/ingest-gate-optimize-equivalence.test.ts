import { describe, expect, it } from 'vitest'
import type { FeedConfig, NormalizedPost } from '@cfb/core-types'
import { compileProjectIngestGate, compileProjectIngestGateRaw } from '@cfb/l1-compile'
import { evaluateProjectL1 } from './evaluate.js'

const baseFeed = (match: FeedConfig['match'], extra: Partial<FeedConfig> = {}): FeedConfig => ({
  feedId: 'f1',
  projectId: 'p1',
  name: 'Test',
  enabled: true,
  poolScope: 'project_only',
  match,
  ...extra,
})

const posts: NormalizedPost[] = [
  {
    uri: 'at://a/post/1',
    cid: 'bafy1',
    authorDid: 'did:plc:vip',
    recordType: 'app.bsky.feed.post',
    text: 'GAGA and FISH hello',
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
  },
  {
    uri: 'at://a/post/2',
    cid: 'bafy2',
    authorDid: 'did:plc:stranger',
    recordType: 'app.bsky.feed.post',
    text: 'FISH only',
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
  },
  {
    uri: 'at://a/post/3',
    cid: 'bafy3',
    authorDid: 'did:plc:vip',
    recordType: 'app.bsky.feed.post',
    text: 'FISH',
    createdAt: '2024-01-01T00:00:00.000Z',
    langs: ['ja'],
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
  },
]

describe('optimized compile equivalence', () => {
  it('matches raw compile on sample posts (GAGA + FISH + language paths)', () => {
    const edges = [
      { source: 'start', target: 'author-mqqyt8s6' },
      { source: 'author-mqqyt8s6', target: 'kw-mqqze95m' },
      { source: 'start', target: 'group-mqqzekdq' },
      { source: 'group-mqqzekdq', target: 'kw-mqqze95m' },
      { source: 'kw-mqqze95m', target: 'lang-mqr17r7r' },
      { source: 'lang-mqr17r7r', target: 'end' },
    ]
    const feeds = [
      baseFeed(
        {
          type: 'group',
          id: 'root',
          logic: 'any',
          children: [
            {
              type: 'group',
              id: 'group-mqqzekdq',
              logic: 'all',
              children: [
                {
                  type: 'author',
                  id: 'author-mqqyt8s6',
                  op: 'in_list',
                  listId: 'vip',
                  runAtIngest: true,
                },
                {
                  type: 'group',
                  id: 'group-mqqzx05g',
                  logic: 'any',
                  children: [
                    {
                      type: 'keyword',
                      id: 'kw-mqqzes0k',
                      op: 'includes',
                      terms: ['GAGA'],
                      fields: ['text'],
                      runAtIngest: true,
                    },
                  ],
                },
              ],
            },
            {
              type: 'keyword',
              id: 'kw-mqqze95m',
              op: 'includes',
              terms: ['FISH'],
              fields: ['text'],
              runAtIngest: true,
            },
            {
              type: 'language',
              id: 'lang-mqr17r7r',
              allow: ['en'],
              unknown: 'exclude',
              runAtIngest: true,
            },
          ],
        },
        {
          visualLayout: {
            positions: {},
            edges: edges.map((e, i) => ({ ...e, id: `e${i}`, branch: true as const })),
          },
        },
      ),
    ]

    const raw = compileProjectIngestGateRaw('p1', feeds)
    const opt = compileProjectIngestGate('p1', feeds)
    const extras = {
      ingestGateExtrasByProject: {
        p1: { authorListDids: { vip: ['did:plc:vip'] } },
      },
    }

    for (const post of posts) {
      const rawResult = evaluateProjectL1(
        post,
        {
          projectId: 'p1',
          name: 'P',
          enabled: true,
          compiledL1Meta: raw.compiledL1Meta,
          ingestGate: raw.ingestGate,
        },
        extras,
      )
      const optResult = evaluateProjectL1(
        post,
        {
          projectId: 'p1',
          name: 'P',
          enabled: true,
          compiledL1Meta: opt.compiledL1Meta,
          ingestGate: opt.ingestGate,
        },
        extras,
      )
      expect(optResult.matched).toBe(rawResult.matched)
    }

    expect(raw.ingestGate.restrictBranches).toHaveLength(1)
    expect(raw.ingestGate.restrictBranches![0]?.type).toBe('language')

    const japaneseFish = evaluateProjectL1(
      posts[2]!,
      {
        projectId: 'p1',
        name: 'P',
        enabled: true,
        compiledL1Meta: raw.compiledL1Meta,
        ingestGate: raw.ingestGate,
      },
      extras,
    )
    // EN is on every canvas path to end (serial before end), but not hoisted — still fails each OR branch.
    expect(japaneseFish.matched).toBe(false)

    expect(opt.ingestGate.includeBranches.length).toBeLessThanOrEqual(
      raw.ingestGate.includeBranches.length,
    )
  })
})
