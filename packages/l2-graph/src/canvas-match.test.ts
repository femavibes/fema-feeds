import { describe, expect, it } from 'vitest'
import type { L2RuleGroup } from '@cfb/core-types'
import {
  canvasEdgesToMatch,
  enumeratePathsStartToEnd,
  resolveFeedMatch,
  sanitizeCanvasEdges,
} from './canvas-match.js'

const baseMatch: L2RuleGroup = {
  type: 'group',
  id: 'root',
  logic: 'all',
  children: [
    {
      type: 'group',
      id: 'g-or',
      logic: 'any',
      children: [{ type: 'keyword', id: 'kw-dog', op: 'includes', terms: ['dog'], fields: ['text'] }],
    },
    {
      type: 'group',
      id: 'g-and',
      logic: 'all',
      children: [
        { type: 'keyword', id: 'kw-pig', op: 'includes', terms: ['pig'], fields: ['text'] },
        { type: 'keyword', id: 'kw-sheep', op: 'includes', terms: ['sheep'], fields: ['text'] },
      ],
    },
    { type: 'labels', id: 'lb-porn', op: 'includes', values: ['porn'], scope: 'all' },
  ],
}

describe('canvas-match', () => {
  it('finds three parallel paths', () => {
    const paths = enumeratePathsStartToEnd([
      { source: 'start', target: 'g-or' },
      { source: 'g-or', target: 'end' },
      { source: 'start', target: 'g-and' },
      { source: 'g-and', target: 'end' },
      { source: 'start', target: 'lb-porn' },
      { source: 'lb-porn', target: 'end' },
    ])
    expect(paths).toHaveLength(3)
  })

  it('parallel paths become OR branches at root', () => {
    const match = canvasEdgesToMatch(baseMatch, [
      { source: 'start', target: 'g-or' },
      { source: 'g-or', target: 'end' },
      { source: 'start', target: 'g-and' },
      { source: 'g-and', target: 'end' },
      { source: 'start', target: 'lb-porn' },
      { source: 'lb-porn', target: 'end' },
    ])
    expect(match.logic).toBe('any')
    expect(match.children).toHaveLength(3)
  })

  it('chains on one path become AND', () => {
    const match: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        { type: 'labels', id: 'lb1', op: 'includes', values: ['porn'], scope: 'all' },
        { type: 'hashtag', id: 'ht1', op: 'includes', tags: ['news'] },
      ],
    }
    const result = canvasEdgesToMatch(match, [
      { source: 'start', target: 'lb1' },
      { source: 'lb1', target: 'ht1' },
      { source: 'ht1', target: 'end' },
    ])
    expect(result.logic).toBe('any')
    expect(result.children).toHaveLength(1)
    const path = result.children[0]
    expect(path?.type).toBe('group')
    if (path?.type === 'group') {
      expect(path.logic).toBe('all')
      expect(path.children.map((c) => c.id)).toEqual(['lb1', 'ht1'])
    }
  })

  it('drops stale wires to nested nodes after reparenting into a group', () => {
    const match: L2RuleGroup = {
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
    }
    const staleEdges = [
      { id: 'e-start-kw-fish', source: 'start', target: 'kw-fish', branch: true },
      { id: 'e-kw-fish-lang-en', source: 'kw-fish', target: 'lang-en', branch: true },
      { id: 'e-lang-en-end', source: 'lang-en', target: 'end', branch: true },
      { id: 'e-kw-fish-group-or', source: 'kw-fish', target: 'group-or', branch: true },
      { id: 'e-group-or-end', source: 'group-or', target: 'end', branch: true },
    ]
    const cleaned = sanitizeCanvasEdges(match, staleEdges)
    expect(cleaned.map((e) => e.id)).toEqual([
      'e-start-kw-fish',
      'e-kw-fish-group-or',
      'e-group-or-end',
    ])

    const resolved = resolveFeedMatch({
      match,
      visualLayout: { positions: {}, edges: staleEdges },
    })
    const paths = enumeratePathsStartToEnd(
      sanitizeCanvasEdges(match, staleEdges).map((e) => ({ source: e.source, target: e.target })),
    )
    expect(paths).toEqual([['kw-fish', 'group-or']])
    expect(resolved.children).toHaveLength(1)
  })
})
