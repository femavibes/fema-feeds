import { describe, expect, it } from 'vitest'
import { matchToFlowGraph } from './flow.js'
import { importLegacyAssignmentRules } from './import-legacy.js'
import { resetImportIds } from './ids.js'
import { flowGraphToMatch, matchRoundTripEquals } from './roundtrip.js'

const match = {
  type: 'group' as const,
  id: 'root',
  logic: 'any' as const,
  children: [
    {
      type: 'group' as const,
      id: 'g1',
      logic: 'all' as const,
      children: [
        { type: 'text' as const, id: 'c1', field: 'text' as const, op: 'contains' as const, value: 'transit' },
      ],
    },
  ],
}

describe('roundtrip', () => {
  it('flowGraphToMatch inverts matchToFlowGraph', () => {
    const graph = matchToFlowGraph(match)
    const rebuilt = flowGraphToMatch(graph)
    expect(rebuilt).toEqual(match)
    expect(matchRoundTripEquals(match)).toBe(true)
  })

  it('chains multiple AND conditions in series', () => {
    const multi = {
      ...match,
      children: [
        {
          type: 'group' as const,
          id: 'g1',
          logic: 'all' as const,
          children: [
            { type: 'text' as const, id: 'c1', field: 'text' as const, op: 'contains' as const, value: 'a' },
            { type: 'hashtag' as const, id: 'c2', op: 'includes' as const, tags: ['transit'] },
          ],
        },
      ],
    }
    expect(matchRoundTripEquals(multi)).toBe(true)
  })
})

describe('importLegacyAssignmentRules', () => {
  it('maps OR groups to any root', () => {
    resetImportIds()
    const root = importLegacyAssignmentRules({
      logic: 'OR',
      groups: [
        {
          logic: 'AND',
          conditions: [{ field: 'text', operator: 'contains', value: 'urbanism' }],
        },
      ],
    })
    expect(root.logic).toBe('any')
    expect(root.children[0]?.type).toBe('group')
  })
})
