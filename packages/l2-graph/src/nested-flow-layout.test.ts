import { describe, expect, it } from 'vitest'

import { layoutMatchFlow, countGroupDescendantNodes } from './nested-flow-layout.js'



describe('layoutMatchFlow', () => {

  it('places top-level conditions between START and FEED with no root box', () => {

    const { nodes, edges } = layoutMatchFlow({

      type: 'group',

      id: 'root',

      logic: 'all',

      children: [

        { type: 'text', id: 'a', field: 'text', op: 'contains', value: 'bike' },

        { type: 'text', id: 'b', field: 'text', op: 'contains', value: 'transit' },

      ],

    })



    expect(nodes.find((n) => n.id === 'root')).toBeUndefined()

    expect(nodes.find((n) => n.id === 'a')?.topLevel).toBe(true)

    expect(nodes.find((n) => n.id === 'b')?.topLevel).toBe(true)

    expect(edges.some((e) => e.source === 'start' && e.target === 'a')).toBe(true)

    expect(edges.some((e) => e.source === 'start' && e.target === 'b')).toBe(true)

    expect(edges.some((e) => e.source === 'a' && e.target === 'end')).toBe(true)

    expect(edges.some((e) => e.source === 'b' && e.target === 'end')).toBe(true)

    expect(edges.every((e) => e.branch)).toBe(true)

  })



  it('keeps START clear of the first top-level block (no overlap)', () => {
    const { nodes } = layoutMatchFlow({
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'group',
          id: 'g1',
          logic: 'any',
          children: [{ type: 'text', id: 'a', field: 'text', op: 'contains', value: 'x' }],
        },
      ],
    })

    const start = nodes.find((n) => n.id === 'start')!
    const end = nodes.find((n) => n.id === 'end')!
    const g1 = nodes.find((n) => n.id === 'g1')!
    const startGap = g1.x - (start.x + start.width)
    const endGap = end.x - (g1.x + g1.width)
    expect(startGap).toBeGreaterThan(40)
    expect(endGap).toBe(startGap)
  })



  it('places direct child groups as top-level flow boxes', () => {

    const { nodes, edges } = layoutMatchFlow({

      type: 'group',

      id: 'root',

      logic: 'any',

      children: [

        {

          type: 'group',

          id: 'g1',

          logic: 'all',

          children: [

            { type: 'text', id: 'x', field: 'text', op: 'contains', value: 'a' },

          ],

        },

        {

          type: 'group',

          id: 'g2',

          logic: 'all',

          children: [

            { type: 'text', id: 'y', field: 'text', op: 'contains', value: 'b' },

          ],

        },

      ],

    })



    expect(nodes.find((n) => n.id === 'g1')?.topLevel).toBe(true)

    expect(nodes.find((n) => n.id === 'g1')?.parentId).toBeUndefined()

    expect(nodes.find((n) => n.id === 'root')).toBeUndefined()

    expect(edges.some((e) => e.source === 'start' && e.target === 'g1')).toBe(true)

    expect(edges.some((e) => e.source === 'start' && e.target === 'g2')).toBe(true)

    expect(edges.some((e) => e.source === 'g1' && e.target === 'end')).toBe(true)

    expect(edges.some((e) => e.source === 'g2' && e.target === 'end')).toBe(true)

    expect(edges.every((e) => e.branch)).toBe(true)

  })



  it('fans START and FEED to every top-level node for ALL root logic', () => {

    const { edges } = layoutMatchFlow({

      type: 'group',

      id: 'root',

      logic: 'all',

      children: [

        { type: 'group', id: 'g1', logic: 'any', children: [] },

        { type: 'group', id: 'g2', logic: 'all', children: [] },

      ],

    })



    expect(edges.some((e) => e.source === 'g1' && e.target === 'g2')).toBe(false)

    expect(edges.some((e) => e.source === 'start' && e.target === 'g1')).toBe(true)

    expect(edges.some((e) => e.source === 'start' && e.target === 'g2')).toBe(true)

    expect(edges.some((e) => e.source === 'g1' && e.target === 'end')).toBe(true)

    expect(edges.some((e) => e.source === 'g2' && e.target === 'end')).toBe(true)

  })



  it('stretches nested conditions and lone subgroups to the parent inner width', () => {

    const { nodes } = layoutMatchFlow({

      type: 'group',

      id: 'root',

      logic: 'all',

      children: [

        {

          type: 'group',

          id: 'and',

          logic: 'all',

          children: [

            { type: 'regex', id: 'rx', op: 'matches', pattern: 'foo', fields: ['text'] },

            { type: 'keyword', id: 'kw', op: 'includes', terms: ['bar'], fields: ['text'] },

            { type: 'group', id: 'or', logic: 'any', children: [] },

          ],

        },

      ],

    })



    const and = nodes.find((n) => n.id === 'and')!

    const innerW = and.width - 32

    expect(nodes.find((n) => n.id === 'rx')?.width).toBe(innerW)

    expect(nodes.find((n) => n.id === 'kw')?.width).toBe(innerW)

    expect(nodes.find((n) => n.id === 'or')?.width).toBe(innerW)

  })


  it('interleaves conditions and nested groups in match child order', () => {
    const { nodes } = layoutMatchFlow({
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'group',
          id: 'outer',
          logic: 'any',
          children: [
            { type: 'keyword', id: 'kw', op: 'includes', terms: ['a'], fields: ['text'] },
            { type: 'group', id: 'or', logic: 'any', children: [] },
            { type: 'group', id: 'and', logic: 'all', children: [] },
          ],
        },
      ],
    })

    const kw = nodes.find((n) => n.id === 'kw')!
    const or = nodes.find((n) => n.id === 'or')!
    const and = nodes.find((n) => n.id === 'and')!
    expect(kw.parentId).toBe('outer')
    expect(or.parentId).toBe('outer')
    expect(and.parentId).toBe('outer')
    expect(kw.y).toBeLessThan(or.y)
    expect(or.y).toBeLessThan(and.y)

    const { nodes: mid } = layoutMatchFlow({
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'group',
          id: 'outer',
          logic: 'any',
          children: [
            { type: 'group', id: 'or', logic: 'any', children: [] },
            { type: 'keyword', id: 'kw', op: 'includes', terms: ['a'], fields: ['text'] },
            { type: 'group', id: 'and', logic: 'all', children: [] },
          ],
        },
      ],
    })
    const kw2 = mid.find((n) => n.id === 'kw')!
    const or2 = mid.find((n) => n.id === 'or')!
    const and2 = mid.find((n) => n.id === 'and')!
    expect(or2.y).toBeLessThan(kw2.y)
    expect(kw2.y).toBeLessThan(and2.y)
  })

  it('grows keyword height when expanded', () => {
    const match = {
      type: 'group' as const,
      id: 'root',
      logic: 'any' as const,
      children: [
        {
          type: 'group' as const,
          id: 'g',
          logic: 'all' as const,
          children: [
            {
              type: 'keyword' as const,
              id: 'kw',
              op: 'includes' as const,
              terms: ['alpha', 'beta', 'gamma'],
              fields: ['text' as const],
            },
          ],
        },
      ],
    }
    const collapsed = layoutMatchFlow(match).nodes.find((n) => n.id === 'kw')!
    const expanded = layoutMatchFlow(match, { expandedIds: ['kw'] }).nodes.find((n) => n.id === 'kw')!
    expect(expanded.height).toBeGreaterThan(collapsed.height)
    const frameCollapsed = layoutMatchFlow(match).nodes.find((n) => n.id === 'g')!
    const frameExpanded = layoutMatchFlow(match, { expandedIds: ['kw'] }).nodes.find((n) => n.id === 'g')!
    expect(frameExpanded.height).toBeGreaterThan(frameCollapsed.height)
  })

  it('collapses group frames to a compact node-count teaser', () => {
    const match = {
      type: 'group' as const,
      id: 'root',
      logic: 'all' as const,
      children: [
        {
          type: 'group' as const,
          id: 'g',
          logic: 'any' as const,
          children: [
            {
              type: 'keyword' as const,
              id: 'kw',
              op: 'includes' as const,
              terms: ['alpha'],
              fields: ['text' as const],
            },
            {
              type: 'keyword' as const,
              id: 'kw2',
              op: 'includes' as const,
              terms: ['beta'],
              fields: ['text' as const],
            },
          ],
        },
      ],
    }
    const expanded = layoutMatchFlow(match).nodes.find((n) => n.id === 'g')!
    const collapsed = layoutMatchFlow(match, { collapsedGroupFrameIds: ['g'] }).nodes.find((n) => n.id === 'g')!
    expect(collapsed.height).toBeLessThan(expanded.height)
    expect(layoutMatchFlow(match, { collapsedGroupFrameIds: ['g'] }).nodes.some((n) => n.id === 'kw')).toBe(false)
    expect(countGroupDescendantNodes(match.children[0] as import('@cfb/core-types').L2RuleGroup)).toBe(2)
  })

})
