import { describe, expect, it } from 'vitest'

import type { FeedConfig, L2ParamControl, L2ParametersCondition } from '@cfb/core-types'

import {
  boundNodeIdsForControl,
  evaluateTrigger,
  tickParamTriggersForFeed,
} from './param-triggers.js'

function feedWithControl(control: L2ParamControl): FeedConfig {
  return {
    feedId: 'f1',
    projectId: 'p1',
    name: 'Test',
    enabled: true,
    poolScope: 'project_only',
    timezone: 'UTC',
    match: {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params1',
          controls: [control],
        } satisfies L2ParametersCondition,
      ],
    },
  }
}

function boolControl(name: string, triggers: L2ParamControl['triggers']): L2ParamControl {
  return {
    name,
    label: name,
    type: 'boolean',
    default: false,
    triggers,
  }
}

describe('boundNodeIdsForControl', () => {
  it('collects binding node ids', () => {
    const c: L2ParamControl = {
      name: 'x',
      label: 'x',
      type: 'boolean',
      default: false,
      bindings: [{ nodeId: 'kw1', kind: 'presence' }],
    }
    expect(boundNodeIdsForControl(c)).toEqual(['kw1'])
  })
})

describe('evaluateTrigger match_rate', () => {
  it('writes active value on threshold cross', () => {
    const trigger = {
      kind: 'match_rate' as const,
      id: 'mr1',
      scope: 'feed' as const,
      windowMinutes: 60,
      comparator: 'gte' as const,
      threshold: 5,
      activeValue: true,
      inactiveValue: false,
      enforce: 'boundaries' as const,
    }
    const control = boolControl('x', [])
    const r = evaluateTrigger({
      trigger,
      control,
      prevSatisfied: false,
      currentValue: false,
      timeZone: 'UTC',
      ctx: {
        matchCount: () => 6,
        lastMatchAt: () => null,
        authorPostedRecently: () => false,
        listMembershipEvent: () => null,
      },
    })
    expect(r.satisfied).toBe(true)
    expect(r.write).toBe(true)
  })

  it('any_bound uses any bound node count', () => {
    const control: L2ParamControl = {
      name: 'x',
      label: 'x',
      type: 'boolean',
      default: false,
      bindings: [
        { nodeId: 'a', kind: 'presence' },
        { nodeId: 'b', kind: 'presence' },
      ],
    }
    const trigger = {
      kind: 'match_rate' as const,
      id: 'mr2',
      scope: 'any_bound' as const,
      windowMinutes: 60,
      comparator: 'gte' as const,
      threshold: 3,
      activeValue: true,
    }
    const r = evaluateTrigger({
      trigger,
      control,
      prevSatisfied: false,
      currentValue: false,
      timeZone: 'UTC',
      ctx: {
        matchCount: (_w, nodeId) => (nodeId === 'b' ? 5 : 0),
        lastMatchAt: () => null,
        authorPostedRecently: () => false,
        listMembershipEvent: () => null,
      },
    })
    expect(r.satisfied).toBe(true)
  })
})

describe('evaluateTrigger staleness', () => {
  it('fires when no recent matches', () => {
    const trigger = {
      kind: 'staleness' as const,
      id: 'st1',
      scope: 'feed' as const,
      staleMinutes: 30,
      activeValue: true,
      inactiveValue: false,
    }
    const control = boolControl('x', [])
    const r = evaluateTrigger({
      trigger,
      control,
      prevSatisfied: false,
      currentValue: false,
      timeZone: 'UTC',
      ctx: {
        matchCount: () => 0,
        lastMatchAt: () => null,
        authorPostedRecently: () => false,
        listMembershipEvent: () => null,
      },
    })
    expect(r.satisfied).toBe(true)
    expect(r.write).toBe(true)
  })
})

describe('tickParamTriggersForFeed', () => {
  it('updates param value when staleness trigger fires', () => {
    const feed = feedWithControl(
      boolControl('quiet_mode', [
        {
          kind: 'staleness',
          id: 'st1',
          scope: 'feed',
          staleMinutes: 60,
          activeValue: true,
          inactiveValue: false,
        },
      ]),
    )
    const now = new Date()
    const { feed: next, changed } = tickParamTriggersForFeed(feed, {
      now,
      matchCount: () => 0,
      lastMatchAt: () => new Date(now.getTime() - 2 * 60 * 60 * 1000),
      authorPostedRecently: () => false,
      listMembershipEvent: () => null,
    })
    expect(changed).toContain('quiet_mode')
    const panel = next.match.children[0]
    if (panel?.type === 'parameters') {
      expect(panel.values?.quiet_mode).toBe(true)
    }
  })
})
