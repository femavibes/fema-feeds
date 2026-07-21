import type {
  FeedConfig,
  L2ParamControl,
  L2ParamScheduleWindow,
  L2ParamValue,
  L2RuleGroup,
} from '@cfb/core-types'

import {
  buildParamValueMap,
  collectParamControls,
  setParamValueAcrossMatch,
} from './apply-parameters.js'

export const DEFAULT_FEED_TIMEZONE = 'UTC'

export type ParamScheduleLocalTime = {
  /** 0=Sun … 6=Sat */
  day: number
  /** Minutes since midnight in feed timezone. */
  minutes: number
}

export type ParamScheduleDecision = {
  paramName: string
  inWindow: boolean
  windowId?: string
  write?: L2ParamValue
}

/** Parse HH:mm → minutes since midnight. Returns null if invalid. */
export function parseScheduleTime(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Local day + time for a Date in an IANA timezone. */
export function localTimeParts(now: Date, timeZone: string): ParamScheduleLocalTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return {
    day: WEEKDAY_TO_INDEX[weekday] ?? 0,
    minutes: hour * 60 + minute,
  }
}

function dayAllowed(window: L2ParamScheduleWindow, day: number): boolean {
  const days = window.daysOfWeek
  if (!days || days.length === 0) return true
  return days.includes(day)
}

/** True when local time falls inside the window (supports overnight spans). */
export function isInsideScheduleWindow(
  window: L2ParamScheduleWindow,
  local: ParamScheduleLocalTime,
): boolean {
  if (!dayAllowed(window, local.day)) return false
  const start = parseScheduleTime(window.startTime)
  const end = parseScheduleTime(window.endTime)
  if (start === null || end === null) return false
  const m = local.minutes
  if (start === end) return false
  if (start < end) return m >= start && m < end
  return m >= start || m < end
}

export function localDateString(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function dateInRange(
  dateStr: string,
  startDate?: string,
  endDate?: string,
): boolean {
  if (startDate && dateStr < startDate) return false
  if (endDate && dateStr > endDate) return false
  return true
}

/** Time + optional calendar date range in feed timezone. */
export function isInsideScheduleWindowWithDates(
  window: L2ParamScheduleWindow,
  local: ParamScheduleLocalTime,
  now: Date,
  timeZone: string,
): boolean {
  const dateStr = localDateString(now, timeZone)
  if (!dateInRange(dateStr, window.startDate, window.endDate)) return false
  return isInsideScheduleWindow(window, local)
}

/** First matching window wins. */
export function activeScheduleWindow(
  windows: L2ParamScheduleWindow[] | undefined,
  local: ParamScheduleLocalTime,
): L2ParamScheduleWindow | undefined {
  for (const w of windows ?? []) {
    if (isInsideScheduleWindow(w, local)) return w
  }
  return undefined
}

function valuesEqual(a: L2ParamValue | undefined, b: L2ParamValue | undefined): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return false
}

function currentParamValue(match: L2RuleGroup, name: string, control: L2ParamControl): L2ParamValue {
  const map = buildParamValueMap(match)
  if (Object.prototype.hasOwnProperty.call(map, name)) return map[name]!
  return control.default
}

/** Compute one Param's schedule decision for this tick. */
export function decideParamScheduleTick(opts: {
  control: L2ParamControl
  prevInWindow: boolean
  prevWindowId?: string
  windows: L2ParamScheduleWindow[]
  local: ParamScheduleLocalTime
  currentValue: L2ParamValue
}): ParamScheduleDecision {
  const { control, prevInWindow, prevWindowId, windows, local, currentValue } = opts
  const active = activeScheduleWindow(windows, local)
  const inWindow = Boolean(active)

  if (inWindow && active) {
    const enforce = active.enforce ?? 'boundaries'
    if (enforce === 'continuous') {
      if (!valuesEqual(currentValue, active.activeValue)) {
        return {
          paramName: control.name,
          inWindow: true,
          windowId: active.id,
          write: active.activeValue,
        }
      }
      return { paramName: control.name, inWindow: true, windowId: active.id }
    }
    if (!prevInWindow) {
      return {
        paramName: control.name,
        inWindow: true,
        windowId: active.id,
        write: active.activeValue,
      }
    }
    return { paramName: control.name, inWindow: true, windowId: active.id }
  }

  if (prevInWindow && !inWindow) {
    const exited = windows.find((w) => w.id === prevWindowId)
    if (exited?.inactiveValue !== undefined && !valuesEqual(currentValue, exited.inactiveValue)) {
      return {
        paramName: control.name,
        inWindow: false,
        write: exited.inactiveValue,
      }
    }
  }

  return { paramName: control.name, inWindow: false }
}

export type ParamScheduleTickResult = {
  feed: FeedConfig
  changed: string[]
}

/** Apply schedule boundary/continuous writes to a feed's live Param values. */
export function tickParamSchedulesForFeed(
  feed: FeedConfig,
  now: Date = new Date(),
): ParamScheduleTickResult {
  const tz = feed.timezone?.trim() || DEFAULT_FEED_TIMEZONE
  const local = localTimeParts(now, tz)
  const runtime = feed.paramScheduleRuntime?.byParam ?? {}
  const controls = collectParamControls(feed.match).filter(
    (c) => (c.schedules?.length ?? 0) > 0,
  )

  if (controls.length === 0) {
    return { feed, changed: [] }
  }

  let match = feed.match
  const changed: string[] = []
  const nextRuntime: Record<string, { inWindow: boolean; windowId?: string }> = {
    ...runtime,
  }

  for (const control of controls) {
    const prev = runtime[control.name]
    const decision = decideParamScheduleTick({
      control,
      prevInWindow: prev?.inWindow ?? false,
      prevWindowId: prev?.windowId,
      windows: control.schedules ?? [],
      local,
      currentValue: currentParamValue(match, control.name, control),
    })

    nextRuntime[control.name] = {
      inWindow: decision.inWindow,
      windowId: decision.windowId,
    }

    if (decision.write !== undefined) {
      match = setParamValueAcrossMatch(match, control.name, decision.write)
      changed.push(control.name)
    }
  }

  const runtimeChanged =
    JSON.stringify(runtime) !== JSON.stringify(nextRuntime)

  if (changed.length === 0 && !runtimeChanged) {
    return { feed, changed: [] }
  }

  return {
    feed: {
      ...feed,
      match,
      paramScheduleRuntime: { byParam: nextRuntime },
    },
    changed,
  }
}
