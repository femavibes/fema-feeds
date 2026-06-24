import { describe, expect, it } from 'vitest'
import type { CompiledIngestGate, IngestGateRule } from '@cfb/core-types'
import { ingestCompositeChildren, isIngestGateComposite } from './ingest-gate-rules.js'
import {
  optimizeIngestGate,
  rulesSemanticallyEqual,
  semanticRuleKey,
} from './ingest-gate-optimize.js'

function leafTypes(rule: IngestGateRule): string[] {
  const out: string[] = []
  const walk = (r: IngestGateRule) => {
    if (isIngestGateComposite(r)) {
      for (const c of ingestCompositeChildren(r)) walk(c)
    } else {
      out.push(r.type)
    }
  }
  walk(rule)
  return out
}

describe('optimizeIngestGate', () => {
  it('dedupes identical OR branches', () => {
    const branch: IngestGateRule = {
      type: 'keyword',
      op: 'includes',
      terms: ['news'],
      fields: ['text'],
      sourceFeedId: 'f1',
      sourceNodeId: 'k1',
    }
    const dup: IngestGateRule = {
      ...branch,
      sourceFeedId: 'f2',
      sourceNodeId: 'k2',
    }
    expect(semanticRuleKey(branch)).toBe(semanticRuleKey(dup))
    const gate: CompiledIngestGate = {
      includeBranches: [branch, dup],
      excludeBranches: [],
    }
    const opt = optimizeIngestGate(gate)
    expect(opt.includeBranches).toHaveLength(1)
  })

  it('hoists language shared by every OR path', () => {
    const language: IngestGateRule = {
      type: 'language',
      allow: ['en'],
      unknown: 'exclude',
    }
    const fish: IngestGateRule = {
      type: 'keyword',
      op: 'includes',
      terms: ['FISH'],
      fields: ['text'],
    }
    const author: IngestGateRule = {
      type: 'author',
      op: 'in_list',
      listId: 'vip',
    }
    const gaga: IngestGateRule = {
      type: 'keyword',
      op: 'includes',
      terms: ['GAGA'],
      fields: ['text'],
    }

    const gate: CompiledIngestGate = {
      includeBranches: [
        { type: 'all', rules: [author, fish, language] },
        { type: 'all', rules: [{ type: 'all', rules: [author, { type: 'any', rules: [gaga] }] }, fish, language] },
      ],
      excludeBranches: [],
    }

    const opt = optimizeIngestGate(gate)
    expect(opt.includeBranches).toHaveLength(1)
    const root = opt.includeBranches[0]!
    expect(root.type).toBe('all')
    if (root.type !== 'all') return

    const top = ingestCompositeChildren(root)
    expect(top.some((r) => r.type === 'language')).toBe(true)
    expect(top.filter((r) => r.type === 'language')).toHaveLength(1)
    expect(top.some((r) => r.type === 'any' || (r.type === 'all' && top.length > 2))).toBe(true)

    const langIdx = top.findIndex((r) => r.type === 'language')
    const fishIdx = top.findIndex((r) => r.type === 'keyword')
    if (langIdx >= 0 && fishIdx >= 0) {
      expect(langIdx).toBeLessThan(fishIdx)
    }
  })

  it('preserves semantics for rulesSemanticallyEqual trees', () => {
    const a: IngestGateRule = {
      type: 'all',
      rules: [
        { type: 'language', allow: ['en'], unknown: 'exclude' },
        { type: 'keyword', op: 'includes', terms: ['x'], fields: ['text'] },
      ],
    }
    const b: IngestGateRule = {
      type: 'all',
      rules: [
        { type: 'keyword', op: 'includes', terms: ['x'], fields: ['text'] },
        { type: 'language', allow: ['en'], unknown: 'exclude' },
      ],
    }
    expect(rulesSemanticallyEqual(a, b)).toBe(true)
  })

  it('does not hoist when OR branches differ at top level', () => {
    const gate: CompiledIngestGate = {
      includeBranches: [
        { type: 'keyword', op: 'includes', terms: ['a'], fields: ['text'] },
        { type: 'keyword', op: 'includes', terms: ['b'], fields: ['text'] },
      ],
      excludeBranches: [],
    }
    const opt = optimizeIngestGate(gate)
    expect(opt.includeBranches).toHaveLength(2)
  })

  it('sorts exclude branches cheap-first (author before keyword)', () => {
    const gate: CompiledIngestGate = {
      includeBranches: [],
      excludeBranches: [
        { type: 'keyword', op: 'excludes', terms: ['spam'], fields: ['text'] },
        { type: 'author', op: 'not_in_list', listId: 'blocked' },
      ],
    }
    const opt = optimizeIngestGate(gate)
    expect(opt.excludeBranches[0]?.type).toBe('author')
    expect(opt.excludeBranches[1]?.type).toBe('keyword')
  })
})
