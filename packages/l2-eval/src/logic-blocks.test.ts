import { describe, expect, it } from 'vitest'
import type { LogicBlockPackage, L2RuleGroup } from '@cfb/core-types'

import { resolveLogicBlockRoot } from './logic-blocks.js'

describe('resolveLogicBlockRoot', () => {
  const nestedRoot: L2RuleGroup = {
    type: 'group',
    id: 'block-root',
    logic: 'all',
    children: [
      {
        type: 'keyword',
        id: 'kw-urban',
        op: 'includes',
        terms: ['urbanism'],
        fields: ['text'],
      },
      {
        type: 'group',
        id: 'inner-or',
        logic: 'any',
        children: [
          {
            type: 'keyword',
            id: 'kw-bike',
            op: 'includes',
            terms: ['bike'],
            fields: ['text'],
          },
        ],
      },
    ],
  }

  const pkg = {
    id: 'pkg-urban',
    ownerDid: 'did:plc:x',
    slug: 'urban-base',
    version: '1.0.2',
    name: 'Urban base',
    visibility: 'collection',
    trustTier: 'none',
    root: nestedRoot,
    visualLayout: {
      positions: {
        'block-root': { x: 0, y: 0 },
        'kw-urban': { x: 100, y: 100 },
      },
      edges: [{ id: 'e1', source: 'start', target: 'kw-urban', branch: true }],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } satisfies LogicBlockPackage

  it('uses persisted nested root instead of canvas edge reinterpretation', () => {
    const resolved = resolveLogicBlockRoot(pkg)
    expect(resolved.logic).toBe('all')
    expect(resolved.children).toHaveLength(2)
    expect(resolved.children[0]?.type).toBe('keyword')
  })
})
