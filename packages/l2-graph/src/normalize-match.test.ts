import { describe, expect, it } from 'vitest'
import { layoutMatchFlow } from './nested-flow-layout.js'
import { normalizeRuleGroup } from './normalize-match.js'

describe('normalizeRuleGroup', () => {
  it('fills missing group children', () => {
    const raw = { type: 'group', id: 'root', logic: 'any' } as import('@cfb/core-types').L2RuleGroup
    const norm = normalizeRuleGroup(raw)
    expect(norm.children).toEqual([])
    expect(() => layoutMatchFlow(norm)).not.toThrow()
  })

  it('fills missing keyword arrays', () => {
    const raw = {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [{ type: 'keyword', id: 'k1', op: 'includes' }],
    } as import('@cfb/core-types').L2RuleGroup
    const norm = normalizeRuleGroup(raw)
    const kw = norm.children[0]
    expect(kw?.type).toBe('keyword')
    if (kw?.type === 'keyword') {
      expect(kw.terms).toEqual([])
      expect(kw.fields).toEqual(['text'])
    }
  })
})
