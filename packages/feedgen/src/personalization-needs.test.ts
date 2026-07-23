import { describe, expect, it } from 'vitest'

import { personalizationNeedsAffinity, personalizationNeedsMutuals } from './personalization-needs.js'

describe('personalizationNeedsMutuals', () => {
  it('detects toggle mode', () => {
    expect(personalizationNeedsMutuals({ boostMutuals: { enabled: true, factor: 1.5 } })).toBe(true)
    expect(personalizationNeedsMutuals({ boostMutuals: { enabled: false, factor: 1.5 } })).toBe(false)
  })

  it('detects is_mutual in formula', () => {
    expect(
      personalizationNeedsMutuals({
        formulaEnabled: true,
        formula: {
          type: 'binary',
          op: '*',
          left: { type: 'field', field: 'is_mutual' },
          right: { type: 'literal', value: 0.3 },
        },
      }),
    ).toBe(true)
  })
})

describe('personalizationNeedsAffinity', () => {
  it('detects feed_affinity in formula', () => {
    expect(
      personalizationNeedsAffinity({
        formulaEnabled: true,
        formula: { type: 'field', field: 'feed_affinity' },
      }),
    ).toBe(true)
  })

  it('detects days_since_interaction in formula', () => {
    expect(
      personalizationNeedsAffinity({
        formulaEnabled: true,
        formula: { type: 'field', field: 'days_since_interaction' },
      }),
    ).toBe(true)
  })
})
