import { describe, it, expect } from 'vitest'
import { ScoutSignalCounter, computeRequiredScouts } from './scout-discovery.js'
import type { ScoutDiscoveryConfig, ScoutThresholdConfig } from '@cfb/core-types'

const baseThreshold: ScoutThresholdConfig = {
  min: 3,
  max: 8,
  scaleWindowMinutes: 60,
  curve: 'linear',
}

const baseConfig: ScoutDiscoveryConfig = {
  enabled: true,
  threshold: baseThreshold,
  maxPostAgeHours: 48,
  maxPendingSignals: 100,
}

describe('computeRequiredScouts', () => {
  it('returns min at t=0', () => {
    expect(computeRequiredScouts(0, baseThreshold)).toBe(3)
  })

  it('returns max at full window', () => {
    const elapsed = 60 * 60_000
    expect(computeRequiredScouts(elapsed, baseThreshold)).toBe(8)
  })

  it('returns midpoint at half window (linear)', () => {
    const elapsed = 30 * 60_000
    expect(computeRequiredScouts(elapsed, baseThreshold)).toBe(5.5)
  })

  it('curved scaling is lower at midpoint', () => {
    const curved: ScoutThresholdConfig = { ...baseThreshold, curve: 'curved', exponent: 1.5 }
    const elapsed = 30 * 60_000
    const required = computeRequiredScouts(elapsed, curved)
    // curved should be less than linear 5.5 at midpoint
    expect(required).toBeLessThan(5.5)
    expect(required).toBeGreaterThan(3)
  })

  it('clamps at max beyond window', () => {
    const elapsed = 120 * 60_000
    expect(computeRequiredScouts(elapsed, baseThreshold)).toBe(8)
  })
})

describe('ScoutSignalCounter', () => {
  function makeCounter(scouts: string[], poolUris: string[] = []) {
    const poolSet = new Set(poolUris)
    return new ScoutSignalCounter(baseConfig, scouts, (uri) => poolSet.has(uri))
  }

  it('ignores non-scout actors', () => {
    const counter = makeCounter(['did:scout:1'])
    const result = counter.recordSignal('did:random:1', 'at://post/1', 'like')
    expect(result).toBeNull()
  })

  it('ignores posts already in pool', () => {
    const counter = makeCounter(['did:scout:1'], ['at://post/1'])
    const result = counter.recordSignal('did:scout:1', 'at://post/1', 'like')
    expect(result).toBeNull()
  })

  it('triggers at min threshold when signals arrive instantly', () => {
    const counter = makeCounter(['did:s:1', 'did:s:2', 'did:s:3'])
    const now = Date.now()
    counter.recordSignal('did:s:1', 'at://post/1', 'like', now)
    counter.recordSignal('did:s:2', 'at://post/1', 'like', now)
    const trigger = counter.recordSignal('did:s:3', 'at://post/1', 'like', now)
    expect(trigger).not.toBeNull()
    expect(trigger!.targetUri).toBe('at://post/1')
    expect(trigger!.distinctScouts).toBe(3)
  })

  it('does not trigger below min', () => {
    const counter = makeCounter(['did:s:1', 'did:s:2', 'did:s:3'])
    const now = Date.now()
    counter.recordSignal('did:s:1', 'at://post/1', 'like', now)
    const result = counter.recordSignal('did:s:2', 'at://post/1', 'like', now)
    expect(result).toBeNull()
  })

  it('same scout multiple interactions counts as 1', () => {
    const counter = makeCounter(['did:s:1', 'did:s:2', 'did:s:3'])
    const now = Date.now()
    counter.recordSignal('did:s:1', 'at://post/1', 'like', now)
    counter.recordSignal('did:s:1', 'at://post/1', 'repost', now)
    counter.recordSignal('did:s:1', 'at://post/1', 'reply', now)
    counter.recordSignal('did:s:2', 'at://post/1', 'like', now)
    const result = counter.recordSignal('did:s:2', 'at://post/1', 'repost', now)
    // Only 2 distinct scouts, need 3
    expect(result).toBeNull()
  })

  it('requires more scouts as time passes', () => {
    const scouts = Array.from({ length: 8 }, (_, i) => `did:s:${i}`)
    const counter = makeCounter(scouts)
    const start = Date.now()
    // At t=0, need 3
    counter.recordSignal('did:s:0', 'at://post/1', 'like', start)
    counter.recordSignal('did:s:1', 'at://post/1', 'like', start)

    // At t=45min, need ~6.75 (linear), so 3 scouts at this point won't trigger
    const t45 = start + 45 * 60_000
    const result = counter.recordSignal('did:s:2', 'at://post/1', 'like', t45)
    expect(result).toBeNull()

    // Add more scouts at t=45min to reach threshold
    counter.recordSignal('did:s:3', 'at://post/1', 'like', t45)
    counter.recordSignal('did:s:4', 'at://post/1', 'like', t45)
    counter.recordSignal('did:s:5', 'at://post/1', 'like', t45)
    const trigger = counter.recordSignal('did:s:6', 'at://post/1', 'like', t45)
    // 7 scouts >= 6.75 required
    expect(trigger).not.toBeNull()
    expect(trigger!.distinctScouts).toBe(7)
  })

  it('sweep evicts old signals', () => {
    const counter = makeCounter(['did:s:1'])
    const old = Date.now() - 49 * 3600_000 // 49 hours ago
    counter.recordSignal('did:s:1', 'at://old/1', 'like', old)
    expect(counter.pendingCount).toBe(1)
    counter.sweep()
    expect(counter.pendingCount).toBe(0)
  })

  it('respects maxPendingSignals', () => {
    const config: ScoutDiscoveryConfig = { ...baseConfig, maxPendingSignals: 3 }
    const counter = new ScoutSignalCounter(config, ['did:s:1'], () => false)
    const now = Date.now()
    counter.recordSignal('did:s:1', 'at://post/1', 'like', now)
    counter.recordSignal('did:s:1', 'at://post/2', 'like', now + 1)
    counter.recordSignal('did:s:1', 'at://post/3', 'like', now + 2)
    // 4th should evict oldest
    counter.recordSignal('did:s:1', 'at://post/4', 'like', now + 3)
    expect(counter.pendingCount).toBe(3)
  })

  it('weighted score reflects interaction types', () => {
    const counter = makeCounter(['did:s:1', 'did:s:2', 'did:s:3'])
    const now = Date.now()
    counter.recordSignal('did:s:1', 'at://post/1', 'repost', now)
    counter.recordSignal('did:s:2', 'at://post/1', 'repost', now)
    const trigger = counter.recordSignal('did:s:3', 'at://post/1', 'like', now)
    // 1.3 + 1.3 + 1.0 = 3.6
    expect(trigger!.weightedScore).toBeCloseTo(3.6)
  })
})
