import { describe, expect, it } from 'vitest'
import type { L2Expr } from '@cfb/core-types'
import { shouldUseQuickFirstOpen } from './skeleton.js'

describe('shouldUseQuickFirstOpen', () => {
  it('defaults on for shallow depth', () => {
    expect(shouldUseQuickFirstOpen({ depth: 80 }, 80, 50)).toBe(false)
  })

  it('defaults on for deep feeds without serve formula', () => {
    expect(shouldUseQuickFirstOpen({ depth: 500 }, 500, 50)).toBe(true)
  })

  it('disables when formula uses serve/view history', () => {
    expect(
      shouldUseQuickFirstOpen(
        {
          depth: 500,
          formulaEnabled: true,
          formula: {
            type: 'binary',
            op: '/',
            left: { type: 'field', field: 'base_score' },
            right: {
              type: 'binary',
              op: '+',
              left: { type: 'literal', value: 1 },
              right: {
                type: 'binary',
                op: '*',
                left: { type: 'field', field: 'times_served' },
                right: { type: 'literal', value: 0.5 },
              },
            },
          } as unknown as L2Expr,
        },
        500,
        50,
      ),
    ).toBe(false)
  })

  it('respects explicit quickFirstOpen: false', () => {
    expect(shouldUseQuickFirstOpen({ depth: 500, quickFirstOpen: false }, 500, 50)).toBe(false)
  })
})
