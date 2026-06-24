import { describe, expect, it } from 'vitest'
import type { ProjectL1Config, ProjectPrefilter } from '@cfb/core-types'
import { PROJECT_PREFILTER_SCOPE_ID } from '@cfb/core-types'
import {
  compileProjectPrefilter,
  emptyPrefilter,
  finalizeProjectForSave,
  normalizePrefilter,
} from './compile-prefilter.js'
import { countDiscoveryPaths } from './ingest-gate-display.js'

describe('compileProjectPrefilter', () => {
  it('empty prefilter → permissive pool (no discovery branches)', () => {
    const { ingestGate, compiledL1Meta } = compileProjectPrefilter('p1', emptyPrefilter())
    expect(ingestGate.includeBranches).toHaveLength(0)
    expect(ingestGate.excludeBranches).toHaveLength(0)
    expect(compiledL1Meta.source).toBe('prefilter')
    expect(compiledL1Meta.liveFeedIds).toBeUndefined()
  })

  it('keyword path compiles with prefilter scope id', () => {
    const prefilter: ProjectPrefilter = {
      match: {
        type: 'group',
        id: 'root',
        logic: 'any',
        children: [
          {
            type: 'keyword',
            id: 'kw1',
            op: 'includes',
            terms: ['fema'],
            fields: ['text'],
          },
        ],
      },
    }
    const { ingestGate } = compileProjectPrefilter('p1', prefilter)
    expect(ingestGate.includeBranches.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(ingestGate)
    expect(serialized).toContain('fema')
    expect(serialized).toContain(PROJECT_PREFILTER_SCOPE_ID)
  })

  it('drops stale nested canvas wires and compiles fish AND (lang OR boogere) as two paths', () => {
    const prefilter = normalizePrefilter({
      match: {
        type: 'group',
        id: 'prefilter-root',
        logic: 'any',
        children: [
          {
            type: 'keyword',
            id: 'kw-fish',
            op: 'includes',
            terms: ['fish'],
            fields: ['text'],
          },
          {
            type: 'group',
            id: 'group-or',
            logic: 'any',
            children: [
              { type: 'language', id: 'lang-en', allow: ['en'], unknown: 'exclude' },
              {
                type: 'keyword',
                id: 'kw-boogere',
                op: 'includes',
                terms: ['BOOGERE'],
                fields: ['text'],
              },
            ],
          },
        ],
      },
      visualLayout: {
        positions: {},
        edges: [
          { id: 'e1', source: 'start', target: 'kw-fish', branch: true },
          { id: 'e2', source: 'kw-fish', target: 'lang-en', branch: true },
          { id: 'e3', source: 'lang-en', target: 'end', branch: true },
          { id: 'e4', source: 'kw-fish', target: 'group-or', branch: true },
          { id: 'e5', source: 'group-or', target: 'end', branch: true },
        ],
      },
    })
    expect(prefilter.visualLayout?.edges).toHaveLength(3)
    const { ingestGate } = compileProjectPrefilter('p1', prefilter)
    expect(countDiscoveryPaths(ingestGate)).toBe(2)
  })
})

describe('finalizeProjectForSave', () => {
  it('compiles prefilter when prefilter field is present', () => {
    const next = finalizeProjectForSave({
      projectId: 'p1',
      name: 'Test',
      enabled: true,
      prefilter: emptyPrefilter(),
    })
    expect(next.compiledL1Meta?.source).toBe('prefilter')
    expect(next.ingestGate).toBeDefined()
  })

  it('preserves legacy feed-compiled gate when prefilter field absent', () => {
    const existing: ProjectL1Config = {
      projectId: 'p1',
      name: 'Legacy',
      enabled: true,
      ingestGate: {
        includeBranches: [
          { type: 'keyword', op: 'includes', terms: ['x'], fields: ['text'] },
        ],
        excludeBranches: [],
      },
      compiledL1Meta: { compiledAt: '2024-01-01', source: 'feeds', liveFeedIds: ['f1'] },
    }
    const next = finalizeProjectForSave(
      { projectId: 'p1', name: 'Legacy', enabled: true },
      existing,
    )
    expect(next.compiledL1Meta?.liveFeedIds).toEqual(['f1'])
    expect(JSON.stringify(next.ingestGate)).toContain('x')
  })
})
