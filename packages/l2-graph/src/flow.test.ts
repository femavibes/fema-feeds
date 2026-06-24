import { describe, expect, it } from 'vitest'
import type { L2RuleGroup } from '@cfb/core-types'
import { matchToFlowGraph, summarizeRule, conditionNodeTitle, groupNodeTitle } from './flow.js'

const match: L2RuleGroup = {
  type: 'group',
  id: 'root',
  logic: 'any',
  children: [
    {
      type: 'group',
      id: 'g1',
      logic: 'all',
      children: [
        { type: 'text', id: 'c1', field: 'text', op: 'contains', value: 'transit' },
      ],
    },
    {
      type: 'group',
      id: 'g2',
      logic: 'all',
      children: [
        { type: 'hashtag', id: 'c2', op: 'includes', tags: ['urbanism'] },
      ],
    },
  ],
}

describe('matchToFlowGraph', () => {
  it('builds start → junctions → conditions → end', () => {
    const g = matchToFlowGraph(match)
    expect(g.nodes.some((n) => n.type === 'start')).toBe(true)
    expect(g.nodes.some((n) => n.type === 'end')).toBe(true)
    expect(g.nodes.filter((n) => n.type === 'junction')).toHaveLength(3)
    expect(g.nodes.filter((n) => n.type === 'condition')).toHaveLength(2)
    expect(g.edges.some((e) => e.source === 'start' && e.target === 'root')).toBe(true)
  })

  it('summarizes rules', () => {
    const g1 = match.children[0]
    expect(g1?.type === 'group' && summarizeRule(g1.children[0]!)).toContain('transit')
  })

  it('builds compact condition titles without term lists', () => {
    const g2 = match.children[1]
    expect(g2?.type === 'group' && conditionNodeTitle(g2.children[0]!)).toBe('HASHTAG [INCLUDES]')
    const g1 = match.children[0]
    expect(g1?.type === 'group' && conditionNodeTitle(g1.children[0]!)).toBe('TEXT [CONTAINS]')
  })

  it('builds compact group titles', () => {
    expect(groupNodeTitle('all')).toBe('AND')
    expect(groupNodeTitle('any')).toBe('OR')
    expect(groupNodeTitle('n_of', 3)).toBe('3-OF')
  })
})
