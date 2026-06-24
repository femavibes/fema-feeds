import { describe, expect, it } from 'vitest'
import type { L2KeywordCondition, L2RuleGroup } from '@cfb/core-types'
import { feedGraphToJson, importFeedGraph } from './feed-graph-io.js'

const sampleMatch: L2RuleGroup = {
  type: 'group',
  id: 'root',
  logic: 'any',
  children: [
    {
      type: 'group',
      id: 'g1',
      logic: 'all',
      children: [
        { type: 'keyword', id: 'kw1', op: 'includes', terms: ['bike'], fields: ['text'] },
      ],
    },
  ],
}

describe('feed-graph-io', () => {
  it('round-trips CFB feed graph export', () => {
    const draft = {
      match: sampleMatch,
      visualLayout: {
        positions: { g1: { x: 100, y: 40 } },
        edges: [{ id: 'e-start-g1', source: 'start', target: 'g1', branch: true }],
      },
    }
    const parsed = JSON.parse(feedGraphToJson(draft)) as unknown
    expect(parsed).toMatchObject({ format: 'cfb-feed-graph', version: 1 })

    const imported = importFeedGraph(parsed)
    expect(imported?.source).toBe('cfb')
    expect(imported?.match).toEqual(sampleMatch)
    expect(imported?.visualLayout).toEqual(draft.visualLayout)
  })

  it('normalizes root match on export when canvas edges exist', () => {
    const kw2: L2KeywordCondition = {
      type: 'keyword',
      id: 'kw2',
      op: 'includes',
      terms: ['x'],
      fields: ['text'],
    }
    const draft = {
      match: {
        ...sampleMatch,
        logic: 'all' as const,
        children: [...sampleMatch.children, kw2],
      },
      visualLayout: {
        positions: { g1: { x: 100, y: 40 }, kw2: { x: 200, y: 40 } },
        edges: [
          { id: 'e-start-g1', source: 'start', target: 'g1', branch: true },
          { id: 'e-g1-end', source: 'g1', target: 'end', branch: true },
          { id: 'e-start-kw2', source: 'start', target: 'kw2', branch: true },
          { id: 'e-kw2-end', source: 'kw2', target: 'end', branch: true },
        ],
      },
    }
    const parsed = JSON.parse(feedGraphToJson(draft)) as { match: L2RuleGroup }
    expect(parsed.match.logic).toBe('any')
    expect(parsed.match.children.map((c) => c.id)).toEqual(['g1', 'kw2'])
  })

  it('imports a feed config snippet with match only', () => {
    const imported = importFeedGraph({ match: sampleMatch })
    expect(imported?.source).toBe('cfb')
    expect(imported?.match.logic).toBe('any')
  })
})
