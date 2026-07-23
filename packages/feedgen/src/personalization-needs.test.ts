import { describe, expect, it } from 'vitest'

import {
  analyzePersonalizationNeeds,
  personalizationNeedsAffinity,
  personalizationNeedsMutuals,
} from './personalization-needs.js'

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
})

describe('analyzePersonalizationNeeds', () => {
  it('detects served history for suppress-served toggles', () => {
    const needs = analyzePersonalizationNeeds({
      suppressServed: { enabled: true, penalty: 0.5, windowHours: 24 },
    })
    expect(needs.servedHistory).toBe(true)
    expect(needs.servedWindowHours).toBe(24)
  })

  it('detects only the data sources a minimal formula uses', () => {
    const needs = analyzePersonalizationNeeds({
      formulaEnabled: true,
      formula: {
        type: 'binary',
        op: '*',
        left: { type: 'field', field: 'base_score' },
        right: { type: 'field', field: 'is_followed' },
      },
    })
    expect(needs.follows).toBe(true)
    expect(needs.mutuals).toBe(false)
    expect(needs.affinity).toBe(false)
    expect(needs.servedHistory).toBe(false)
    expect(needs.lastOpen).toBe(false)
  })

  it('requires follows when mutuals are needed', () => {
    const needs = analyzePersonalizationNeeds({
      formulaEnabled: true,
      formula: { type: 'field', field: 'is_mutual' },
    })
    expect(needs.mutuals).toBe(true)
    expect(needs.follows).toBe(true)
  })
})
