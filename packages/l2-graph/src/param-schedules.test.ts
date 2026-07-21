import { describe, expect, it } from 'vitest'
import type { FeedConfig, L2ParamControl } from '@cfb/core-types'

import {
  activeScheduleWindow,
  decideParamScheduleTick,
  isInsideScheduleWindow,
  parseScheduleTime,
  tickParamSchedulesForFeed,
} from './param-schedules.js'

const boolControl: L2ParamControl = {
  name: 'strict',
  label: 'Strict',
  type: 'boolean',
  default: false,
  schedules: [
    {
      id: 'w1',
      startTime: '06:00',
      endTime: '10:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      activeValue: true,
      inactiveValue: false,
    },
  ],
}

function feedWithControl(control: L2ParamControl, values?: Record<string, boolean>): FeedConfig {
  return {
    feedId: 'test',
    projectId: 'p',
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
          id: 'params',
          controls: [control],
          values,
        },
      ],
    },
  }
}

describe('parseScheduleTime', () => {
  it('parses HH:mm', () => {
    expect(parseScheduleTime('06:00')).toBe(360)
    expect(parseScheduleTime('10:30')).toBe(630)
  })
})

describe('isInsideScheduleWindow', () => {
  it('inside simple window', () => {
    const w = boolControl.schedules![0]!
    expect(isInsideScheduleWindow(w, { day: 1, minutes: 420 })).toBe(true) // Mon 7:00
    expect(isInsideScheduleWindow(w, { day: 1, minutes: 300 })).toBe(false) // Mon 5:00
    expect(isInsideScheduleWindow(w, { day: 0, minutes: 420 })).toBe(false) // Sun
  })
})

describe('decideParamScheduleTick', () => {
  it('boundaries: writes on enter only', () => {
    const w = boolControl.schedules![0]!
    const enter = decideParamScheduleTick({
      control: boolControl,
      prevInWindow: false,
      windows: [w],
      local: { day: 1, minutes: 420 },
      currentValue: false,
    })
    expect(enter.write).toBe(true)
    expect(enter.inWindow).toBe(true)

    const inside = decideParamScheduleTick({
      control: boolControl,
      prevInWindow: true,
      prevWindowId: w.id,
      windows: [w],
      local: { day: 1, minutes: 480 },
      currentValue: false,
    })
    expect(inside.write).toBeUndefined()
  })

  it('boundaries: last write wins inside window (no re-apply)', () => {
    const w = boolControl.schedules![0]!
    const insideAfterApiOff = decideParamScheduleTick({
      control: boolControl,
      prevInWindow: true,
      prevWindowId: w.id,
      windows: [w],
      local: { day: 1, minutes: 480 },
      currentValue: false,
    })
    expect(insideAfterApiOff.write).toBeUndefined()
  })

  it('boundaries: writes inactive on exit', () => {
    const w = boolControl.schedules![0]!
    const exit = decideParamScheduleTick({
      control: boolControl,
      prevInWindow: true,
      prevWindowId: w.id,
      windows: [w],
      local: { day: 1, minutes: 600 },
      currentValue: true,
    })
    expect(exit.write).toBe(false)
    expect(exit.inWindow).toBe(false)
  })

  it('continuous: re-applies active while inside', () => {
    const w = {
      ...boolControl.schedules![0]!,
      enforce: 'continuous' as const,
    }
    const again = decideParamScheduleTick({
      control: boolControl,
      prevInWindow: true,
      prevWindowId: w.id,
      windows: [w],
      local: { day: 1, minutes: 480 },
      currentValue: false,
    })
    expect(again.write).toBe(true)
  })
})

describe('tickParamSchedulesForFeed', () => {
  it('applies enter write and tracks runtime', () => {
    const feed = feedWithControl(boolControl, { strict: false })
    // Monday 2024-01-01 is UTC; use a Monday 07:00 UTC instant
    const monday7 = new Date('2024-01-01T07:00:00.000Z')
    const r1 = tickParamSchedulesForFeed(feed, monday7)
    expect(r1.changed).toContain('strict')
    const panel = r1.feed.match.children[0]
    if (panel?.type === 'parameters') {
      expect(panel.values?.strict).toBe(true)
    }
    expect(r1.feed.paramScheduleRuntime?.byParam?.strict?.inWindow).toBe(true)

    const r2 = tickParamSchedulesForFeed(r1.feed, monday7)
    expect(r2.changed).toEqual([])
  })
})

describe('activeScheduleWindow', () => {
  it('returns first matching window', () => {
    const windows = [
      { id: 'a', startTime: '06:00', endTime: '12:00', activeValue: 'a' },
      { id: 'b', startTime: '06:00', endTime: '12:00', activeValue: 'b' },
    ]
    const hit = activeScheduleWindow(windows, { day: 1, minutes: 420 })
    expect(hit?.id).toBe('a')
  })
})
