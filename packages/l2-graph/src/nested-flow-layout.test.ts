import { describe, expect, it } from 'vitest'

import { layoutMatchFlow } from './nested-flow-layout.js'



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

})


