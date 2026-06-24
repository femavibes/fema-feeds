import { describe, expect, it } from 'vitest'
import type { FeedConfig } from '@cfb/core-types'
import {
  buildIngestGateFromPaths,
  collectIngestPathsFromFeed,
  dnfPathsFromRule,
  extractMandatoryConjuncts,
} from './ingest-path-dnf.js'
import { compileProjectIngestGate } from './compile-from-feeds.js'

const baseFeed = (match: FeedConfig['match'], extra: Partial<FeedConfig> = {}): FeedConfig => ({
  feedId: 'f1',
  projectId: 'p1',
  name: 'Test',
  enabled: true,
  poolScope: 'project_only',
  match,
  ...extra,
})

describe('dnfPathsFromRule', () => {
  it('expands ANY(Spanish, fafa) to two paths without mandatory intersection', () => {
    const rule = {
      type: 'any' as const,
      rules: [
        { type: 'language' as const, allow: ['es'], unknown: 'exclude' as const },
        { type: 'keyword' as const, op: 'includes' as const, terms: ['fafa'], fields: ['text' as const] },
      ],
    }
    const paths = dnfPathsFromRule(rule)
    expect(paths).toHaveLength(2)
    expect(extractMandatoryConjuncts(paths)).toHaveLength(0)

    const gate = buildIngestGateFromPaths(paths)
    expect(gate.restrictBranches).toHaveLength(0)
    expect(gate.includeBranches).toHaveLength(2)
  })
})

describe('collectIngestPathsFromFeed', () => {
  it('preserves OR between language and keyword on same feed', () => {
    const feed = baseFeed({
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'keyword',
          id: 'k1',
          op: 'includes',
          terms: ['HAHAHA'],
          fields: ['text'],
          runAtIngest: true,
        },
        {
          type: 'group',
          id: 'g1',
          logic: 'any',
          children: [
            {
              type: 'language',
              id: 'lang1',
              allow: ['es'],
              unknown: 'exclude',
              runAtIngest: true,
            },
            {
              type: 'keyword',
              id: 'k2',
              op: 'includes',
              terms: ['fafa'],
              fields: ['text'],
              runAtIngest: true,
            },
          ],
        },
      ],
    })

    const paths = collectIngestPathsFromFeed(feed)
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(extractMandatoryConjuncts(paths)).toHaveLength(0)

    const { ingestGate } = compileProjectIngestGate('p1', [feed])
    expect(ingestGate.restrictBranches ?? []).toHaveLength(0)
    const serialized = JSON.stringify(ingestGate.includeBranches)
    expect(serialized).toContain('HAHAHA')
    expect(serialized).toContain('fafa')
    expect(serialized).toContain('"type":"language"')
  })

  it('hoists language to restrictBranches only when on every path', () => {
    const feed = baseFeed({
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
    })

    const { ingestGate } = compileProjectIngestGate('p1', [feed])
    expect(ingestGate.restrictBranches).toHaveLength(1)
    expect(ingestGate.restrictBranches![0]?.type).toBe('language')
    expect(JSON.stringify(ingestGate.includeBranches)).not.toContain('"type":"language"')
  })
})
