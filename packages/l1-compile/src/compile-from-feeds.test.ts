import { describe, expect, it } from 'vitest'
import type { FeedConfig } from '@cfb/core-types'
import { compileProjectIngestGate } from './compile-from-feeds.js'
import { ingestCompositeChildren } from './ingest-gate-rules.js'

const baseFeed = (match: FeedConfig['match'], extra: Partial<FeedConfig> = {}): FeedConfig => ({
  feedId: 'f1',
  projectId: 'p1',
  name: 'Test',
  enabled: true,
  poolScope: 'project_only',
  match,
  ...extra,
})

describe('compileProjectIngestGate', () => {
  it('unions ingest-flagged includes with OR semantics across feeds', () => {
    const feeds: FeedConfig[] = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'any',
        children: [
          {
            type: 'keyword',
            id: 'k1',
            op: 'includes',
            terms: ['transit'],
            fields: ['text'],
            runAtIngest: true,
          },
        ],
      }),
      {
        feedId: 'f2',
        projectId: 'p1',
        name: 'Two',
        enabled: true,
        poolScope: 'project_only',
        match: {
          type: 'group',
          id: 'root2',
          logic: 'any',
          children: [
            {
              type: 'hashtag',
              id: 'h1',
              op: 'includes',
              tags: ['maps'],
              runAtIngest: true,
            },
          ],
        },
      },
    ]
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.includeBranches).toHaveLength(2)
    expect(ingestGate.includeBranches.some((b) => b.type === 'keyword')).toBe(true)
    expect(ingestGate.includeBranches.some((b) => b.type === 'hashtag')).toBe(true)
  })

  it('compiles serial canvas path as AND group', () => {
    const feeds = [
      baseFeed(
        {
          type: 'group',
          id: 'root',
          logic: 'any',
          children: [
            {
              type: 'author',
              id: 'a1',
              op: 'in_list',
              listId: 'reporters',
              runAtIngest: true,
            },
            {
              type: 'keyword',
              id: 'k1',
              op: 'includes',
              terms: ['breaking'],
              fields: ['text'],
              runAtIngest: true,
            },
          ],
        },
        {
          visualLayout: {
            positions: {},
            edges: [
              { id: 'e1', source: 'start', target: 'a1', branch: true },
              { id: 'e2', source: 'a1', target: 'k1', branch: true },
              { id: 'e3', source: 'k1', target: 'end', branch: true },
            ],
          },
        },
      ),
    ]
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.includeBranches).toHaveLength(1)
    const rule = ingestGate.includeBranches[0]!
    expect(rule.type).toBe('all')
    if (rule.type === 'all') {
      const children = ingestCompositeChildren(rule)
      expect(children).toHaveLength(2)
      expect(children.some((b) => b.type === 'author')).toBe(true)
      expect(children.some((b) => b.type === 'keyword')).toBe(true)
    }
  })

  it('compiles nested ALL on a serial canvas path', () => {
    const edges = [
      { source: 'start', target: 'group-mqqzekdq' },
      { source: 'group-mqqzekdq', target: 'kw-mqqze95m' },
      { source: 'kw-mqqze95m', target: 'end' },
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
                  type: 'keyword',
                  id: 'kw-mqqzes0k',
                  op: 'includes',
                  terms: ['GAGA'],
                  fields: ['text'],
                  runAtIngest: true,
                },
                {
                  type: 'author',
                  id: 'author-mqqyt8s6',
                  op: 'in_list',
                  listId: 'vip',
                  runAtIngest: true,
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
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.includeBranches).toHaveLength(1)
    const rule = ingestGate.includeBranches[0]!
    expect(rule.type).toBe('all')
    if (rule.type === 'all') {
      const children = ingestCompositeChildren(rule)
      expect(children.length).toBeGreaterThanOrEqual(2)
      expect(children.some((b) => b.type === 'author')).toBe(true)
      expect(children.some((b) => b.type === 'keyword')).toBe(true)
    }
  })

  it('preserves nested ANY groups (author AND GAGA) on canvas path', () => {
    const edges = [
      { source: 'start', target: 'group-mqqzekdq' },
      { source: 'group-mqqzekdq', target: 'kw-mqqze95m' },
      { source: 'start', target: 'author-mqqyt8s6' },
      { source: 'author-mqqyt8s6', target: 'kw-mqqze95m' },
      { source: 'kw-mqqze95m', target: 'end' },
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
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.includeBranches).toHaveLength(1)

    const serialized = JSON.stringify(ingestGate.includeBranches)
    expect(serialized).toContain('GAGA')
    expect(serialized).toContain('FISH')
    expect(serialized).toContain('vip')
  })

  it('skips nodes with runAtIngest false inside AND groups', () => {
    const feeds = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'keyword',
            id: 'k1',
            op: 'includes',
            terms: ['secret'],
            fields: ['text'],
            runAtIngest: false,
          },
          {
            type: 'keyword',
            id: 'k2',
            op: 'includes',
            terms: ['public'],
            fields: ['text'],
            runAtIngest: true,
          },
        ],
      }),
    ]
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.includeBranches).toHaveLength(1)
    const rule = ingestGate.includeBranches[0]!
    expect(rule.type).toBe('keyword')
    if (rule.type === 'keyword') {
      expect(rule.terms).toContain('public')
    }
  })

  it('compiles authorsOnly from author node toggle', () => {
    const feeds = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'any',
        children: [
          {
            type: 'author',
            id: 'a1',
            op: 'in_list',
            listId: 'vip',
            runAtIngest: true,
            authorsOnly: true,
          },
        ],
      }),
    ]
    const result = compileProjectIngestGate('p1', feeds)
    expect(result.authorsOnly).toBe(true)
  })

  it('defaults regex to feed-only unless runAtIngest true', () => {
    const feeds = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'regex',
            id: 'r1',
            op: 'matches',
            pattern: 'foo',
            fields: ['text'],
          },
        ],
      }),
    ]
    expect(compileProjectIngestGate('p1', feeds).ingestGate.includeBranches).toHaveLength(0)

    const withIngest = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'regex',
            id: 'r1',
            op: 'matches',
            pattern: 'foo',
            fields: ['text'],
            runAtIngest: true,
          },
        ],
      }),
    ]
    expect(compileProjectIngestGate('p1', withIngest).ingestGate.includeBranches).toHaveLength(1)
  })

  it('marks no live feeds when none enabled', () => {
    const feeds = [
      {
        ...baseFeed({ type: 'group', id: 'r', logic: 'all', children: [] }),
        enabled: false,
      },
    ]
    const { compiledL1Meta } = compileProjectIngestGate('p1', feeds)
    expect(compiledL1Meta.liveFeedIds).toHaveLength(0)
  })

  it('puts pool-on language in project-wide restrictBranches when on every path', () => {
    const feeds = [
      baseFeed({
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'keyword',
            id: 'k1',
            op: 'includes',
            terms: ['FISH'],
            fields: ['text'],
            runAtIngest: true,
          },
          {
            type: 'language',
            id: 'lang1',
            allow: ['en'],
            unknown: 'exclude',
            runAtIngest: true,
          },
        ],
      }),
    ]
    const { ingestGate } = compileProjectIngestGate('p1', feeds)
    expect(ingestGate.restrictBranches).toHaveLength(1)
    expect(ingestGate.restrictBranches![0]?.type).toBe('language')
    const serialized = JSON.stringify(ingestGate.includeBranches)
    expect(serialized).not.toContain('"type":"language"')
  })
})
