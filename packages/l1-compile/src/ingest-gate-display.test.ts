import { describe, expect, it } from 'vitest'
import type { CompiledIngestGate } from '@cfb/core-types'
import {
  expandDiscoveryPaths,
  flattenCombinedDiscoveryPaths,
  groupDiscoveryPathsByFeed,
  jetstreamEvalSteps,
} from './ingest-gate-display.js'
import { optimizeIngestGate } from './ingest-gate-optimize.js'

describe('jetstreamEvalSteps', () => {
  it('lists compact pipeline with sourced requirements, not per-path noise', () => {
    const gate: CompiledIngestGate = {
      includeBranches: [
        { type: 'keyword', op: 'includes', terms: ['HAHAHA'], fields: ['text'], sourceFeedId: 'f1' },
        {
          type: 'all',
          rules: [
            { type: 'keyword', op: 'includes', terms: ['FISH'], fields: ['text'], sourceFeedId: 'f3' },
            { type: 'author', op: 'in_list', listId: 'vip', sourceFeedId: 'f3' },
          ],
          sourceFeedId: 'f3',
        },
      ],
      excludeBranches: [],
      restrictBranches: [
        { type: 'language', allow: ['en'], unknown: 'exclude', sourceFeedId: 'f3' },
      ],
    }

    const steps = jetstreamEvalSteps(gate, false, { f1: 'Feed One', f3: 'Feed Three' })
    expect(steps.some((s) => s.kind === 'restrict' && s.label.includes('from Feed Three'))).toBe(true)
    expect(steps.findIndex((s) => s.kind === 'restrict')).toBeLessThan(
      steps.findIndex((s) => s.kind === 'or-path'),
    )
  })
})

describe('expandDiscoveryPaths', () => {
  it('splits ALL(shared, ANY(a, b)) into separate paths', () => {
    const rule = {
      type: 'all' as const,
      rules: [
        { type: 'author' as const, op: 'in_list' as const, listId: 'vip', sourceFeedId: 'f3' },
        {
          type: 'any' as const,
          rules: [
            { type: 'keyword' as const, op: 'includes' as const, terms: ['GAGA'], fields: ['text' as const] },
            { type: 'keyword' as const, op: 'includes' as const, terms: ['FISH'], fields: ['text' as const] },
          ],
        },
      ],
      sourceFeedId: 'f3',
    }

    const paths = expandDiscoveryPaths(rule)
    expect(paths).toHaveLength(2)
    expect(groupDiscoveryPathsByFeed({ includeBranches: [rule], excludeBranches: [] }, { f3: 'F3' })[0]
      ?.paths).toHaveLength(2)
  })
})

describe('feed-scoped optimize', () => {
  it('hoists shared conjuncts within a feed but not across feeds', () => {
    const raw: CompiledIngestGate = {
      includeBranches: [
        { type: 'keyword', op: 'includes', terms: ['HAHAHA'], fields: ['text'], sourceFeedId: 'f1' },
        {
          type: 'all',
          rules: [
            { type: 'author', op: 'in_list', listId: 'vip', sourceFeedId: 'f3' },
            { type: 'keyword', op: 'includes', terms: ['FISH'], fields: ['text'], sourceFeedId: 'f3' },
            { type: 'language', allow: ['en'], unknown: 'exclude', sourceFeedId: 'f3' },
          ],
          sourceFeedId: 'f3',
        },
        {
          type: 'all',
          rules: [
            {
              type: 'all',
              rules: [
                { type: 'author', op: 'in_list', listId: 'vip', sourceFeedId: 'f3' },
                { type: 'keyword', op: 'includes', terms: ['GAGA'], fields: ['text'], sourceFeedId: 'f3' },
              ],
              sourceFeedId: 'f3',
            },
            { type: 'keyword', op: 'includes', terms: ['FISH'], fields: ['text'], sourceFeedId: 'f3' },
            { type: 'language', allow: ['en'], unknown: 'exclude', sourceFeedId: 'f3' },
          ],
          sourceFeedId: 'f3',
        },
      ],
      excludeBranches: [],
    }

    const opt = optimizeIngestGate(raw)
    expect(opt.includeBranches).toHaveLength(2)
    const serialized = JSON.stringify(opt.includeBranches)
    expect(serialized).toContain('HAHAHA')
    expect(serialized).toContain('"type":"any"')
    expect(serialized).toContain('"type":"language"')
  })
})
