import { describe, expect, it } from 'vitest'

import {
  LOGIC_BLOCK_EDITOR_ROOT_ID,
  logicBlockRootFromCanvasMatch,
  peelLogicBlockEditorShell,
  wrapLogicBlockForCanvas,
} from './logic-block-shell.js'

const andRoot = {
  type: 'group' as const,
  id: 'and-1',
  logic: 'all' as const,
  children: [{ type: 'text' as const, id: 't1', field: 'text' as const, op: 'contains' as const, value: 'x' }],
}

describe('logic-block-shell', () => {
  it('peels stacked editor OR shells back to the real AND root', () => {
    const stacked = {
      type: 'group' as const,
      id: LOGIC_BLOCK_EDITOR_ROOT_ID,
      logic: 'any' as const,
      children: [
        {
          type: 'group' as const,
          id: LOGIC_BLOCK_EDITOR_ROOT_ID,
          logic: 'any' as const,
          children: [
            {
              type: 'group' as const,
              id: LOGIC_BLOCK_EDITOR_ROOT_ID,
              logic: 'any' as const,
              children: [andRoot],
            },
          ],
        },
      ],
    }
    const peeled = peelLogicBlockEditorShell(stacked)
    expect(peeled.id).toBe('and-1')
    expect(peeled.logic).toBe('all')
  })

  it('wrap then unwrap round-trips the package root', () => {
    const wrapped = wrapLogicBlockForCanvas(andRoot)
    expect(wrapped.id).toBe(LOGIC_BLOCK_EDITOR_ROOT_ID)
    expect(wrapped.children).toHaveLength(1)
    expect(wrapped.children[0]?.id).toBe('and-1')

    const saved = logicBlockRootFromCanvasMatch(wrapped)
    expect(saved.id).toBe('and-1')
    expect(saved.logic).toBe('all')
  })

  it('wrap does not stack when package already has a shell', () => {
    const once = wrapLogicBlockForCanvas(andRoot)
    const twice = wrapLogicBlockForCanvas(once)
    expect(twice.children).toHaveLength(1)
    expect(twice.children[0]?.id).toBe('and-1')
  })
})
