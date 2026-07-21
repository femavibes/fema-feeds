import type {
  FeedConfig,
  L2ParamControl,
  L2ParamMatchRateTrigger,
  L2ParamScheduleWindow,
  L2ParamStalenessTrigger,
  L2ParamTrigger,
  L2ParamTimeWindowTrigger,
  L2ParamValue,
  L2RuleGroup,
} from '@cfb/core-types'

import {
  buildParamValueMap,
  collectParamControls,
  setParamValueAcrossMatch,
} from './apply-parameters.js'
import {
  DEFAULT_FEED_TIMEZONE,
  decideParamScheduleTick,
  isInsideScheduleWindowWithDates,
  localTimeParts,
  type ParamScheduleLocalTime,
} from './param-schedules.js'

export type ParamTriggerTickContext = {
  now?: Date
  /** Matches in rolling window (feed-level when nodeId omitted). */
  matchCount: (windowMinutes: number, nodeId?: string) => number
  /** Last match timestamp (feed-level when nodeId omitted). */
  lastMatchAt: (nodeId?: string) => Date | null
  /** True if an author from lists/DIDs posted within lookback. */
  authorPostedRecently: (
    authorDids: string[],
    authorListIds: string[],
    lookbackMinutes: number,
  ) => boolean
  /** Pending list membership event since last tick, if any. */
  listMembershipEvent: (
    listId: string,
  ) => 'member_added' | 'member_removed' | 'any_change' | null
}

export type ParamTriggerWrite = {
  paramName: string
  triggerId: string
  write: L2ParamValue
}

/** Merge legacy schedules into unified triggers list. */
export function triggersForControl(control: L2ParamControl): L2ParamTrigger[] {
  const out: L2ParamTrigger[] = [...(control.triggers ?? [])]
  for (const s of control.schedules ?? []) {
    out.push(scheduleWindowToTrigger(s))
  }
  return out
}

export function scheduleWindowToTrigger(s: L2ParamScheduleWindow): L2ParamTimeWindowTrigger {
  return {
    kind: 'time_window',
    id: s.id,
    label: s.label,
    daysOfWeek: s.daysOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    startDate: s.startDate,
    endDate: s.endDate,
    activeValue: s.activeValue,
    inactiveValue: s.inactiveValue,
    enforce: s.enforce,
  }
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

function isTimeWindowActive(
  trigger: L2ParamTimeWindowTrigger,
  local: ParamScheduleLocalTime,
  now: Date,
  timeZone: string,
): boolean {
  const window: L2ParamScheduleWindow = {
    id: trigger.id,
    daysOfWeek: trigger.daysOfWeek,
    startTime: trigger.startTime,
    endTime: trigger.endTime,
    startDate: trigger.startDate,
    endDate: trigger.endDate,
    activeValue: trigger.activeValue,
  }
  return isInsideScheduleWindowWithDates(window, local, now, timeZone)
}

function compareCount(count: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case 'lt':
      return count < threshold
    case 'lte':
      return count <= threshold
    case 'gt':
      return count > threshold
    case 'gte':
      return count >= threshold
    default:
      return false
  }
}

export type TriggerEvalResult = {
  triggerId: string
  satisfied: boolean
  write?: L2ParamValue
  timeState?: { inWindow: boolean; windowId?: string }
}

/** Evaluate one trigger; returns write on edge cross or continuous re-apply. */
/** Node ids this Param controls (bindings + legacy targetNodeIds). */
export function boundNodeIdsForControl(control: L2ParamControl): string[] {
  const ids = new Set<string>()
  for (const b of control.bindings ?? []) {
    const id = b.nodeId?.trim()
    if (id) ids.add(id)
  }
  for (const id of control.targetNodeIds ?? []) {
    const t = id?.trim()
    if (t) ids.add(t)
  }
  for (const opt of control.options ?? []) {
    for (const b of opt.bindings ?? []) {
      const id = b.nodeId?.trim()
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

function evalMatchRateListen(
  trigger: L2ParamMatchRateTrigger,
  control: L2ParamControl,
  ctx: ParamTriggerTickContext,
): boolean {
  const { windowMinutes, comparator, threshold } = trigger
  const scope = trigger.scope ?? 'feed'
  if (scope === 'feed') {
    return compareCount(ctx.matchCount(windowMinutes), comparator, threshold)
  }
  if (scope === 'node') {
    const nodeId = trigger.nodeId?.trim()
    if (!nodeId) return false
    return compareCount(ctx.matchCount(windowMinutes, nodeId), comparator, threshold)
  }
  const bound = boundNodeIdsForControl(control)
  if (scope === 'any_bound') {
    if (bound.length === 0) {
      return compareCount(ctx.matchCount(windowMinutes), comparator, threshold)
    }
    return bound.some((id) =>
      compareCount(ctx.matchCount(windowMinutes, id), comparator, threshold),
    )
  }
  if (scope === 'all_bound') {
    if (bound.length === 0) return false
    return bound.every((id) =>
      compareCount(ctx.matchCount(windowMinutes, id), comparator, threshold),
    )
  }
  return false
}

function isStale(last: Date | null, staleMinutes: number, now: Date): boolean {
  const staleMs = staleMinutes * 60 * 1000
  return !last || now.getTime() - last.getTime() >= staleMs
}

function evalStalenessListen(
  trigger: L2ParamStalenessTrigger,
  control: L2ParamControl,
  ctx: ParamTriggerTickContext,
  now: Date,
): boolean {
  const scope = trigger.scope ?? 'feed'
  if (scope === 'feed') {
    return isStale(ctx.lastMatchAt(), trigger.staleMinutes, now)
  }
  if (scope === 'node') {
    const nodeId = trigger.nodeId?.trim()
    if (!nodeId) return false
    return isStale(ctx.lastMatchAt(nodeId), trigger.staleMinutes, now)
  }
  const bound = boundNodeIdsForControl(control)
  if (scope === 'any_bound') {
    if (bound.length === 0) {
      return isStale(ctx.lastMatchAt(), trigger.staleMinutes, now)
    }
    return bound.some((id) => isStale(ctx.lastMatchAt(id), trigger.staleMinutes, now))
  }
  if (scope === 'all_bound') {
    if (bound.length === 0) return false
    return bound.every((id) => isStale(ctx.lastMatchAt(id), trigger.staleMinutes, now))
  }
  return false
}

export function evaluateTrigger(opts: {
  trigger: L2ParamTrigger
  control: L2ParamControl
  prevSatisfied: boolean
  prevTimeInWindow?: boolean
  prevTimeWindowId?: string
  currentValue: L2ParamValue
  ctx: ParamTriggerTickContext
  timeZone: string
}): TriggerEvalResult {
  const { trigger, control, prevSatisfied, currentValue, ctx, timeZone } = opts
  const now = ctx.now ?? new Date()
  const tz = timeZone.trim() || DEFAULT_FEED_TIMEZONE

  if (trigger.kind === 'time_window') {
    const local = localTimeParts(now, tz)
    const inWindow = isTimeWindowActive(trigger, local, now, tz)
    const decision = decideParamScheduleTick({
      control: { name: '_', label: '', type: 'boolean', default: false },
      prevInWindow: opts.prevTimeInWindow ?? false,
      prevWindowId: opts.prevTimeWindowId,
      windows: [
        {
          id: trigger.id,
          daysOfWeek: trigger.daysOfWeek,
          startTime: trigger.startTime,
          endTime: trigger.endTime,
          startDate: trigger.startDate,
          endDate: trigger.endDate,
          activeValue: trigger.activeValue,
          inactiveValue: trigger.inactiveValue,
          enforce: trigger.enforce,
        },
      ],
      local,
      currentValue,
    })
    return {
      triggerId: trigger.id,
      satisfied: inWindow,
      write: decision.write,
      timeState: { inWindow: decision.inWindow, windowId: decision.windowId },
    }
  }

  if (trigger.kind === 'match_rate') {
    const satisfied = evalMatchRateListen(trigger, control, ctx)
    return edgeWrite(trigger, prevSatisfied, satisfied, currentValue)
  }

  if (trigger.kind === 'staleness') {
    const now = ctx.now ?? new Date()
    const satisfied = evalStalenessListen(trigger, control, ctx, now)
    return edgeWrite(trigger, prevSatisfied, satisfied, currentValue)
  }

  if (trigger.kind === 'author_post') {
    const satisfied = ctx.authorPostedRecently(
      trigger.authorDids ?? [],
      trigger.authorListIds ?? [],
      trigger.lookbackMinutes ?? 5,
    )
    return edgeWrite(trigger, prevSatisfied, satisfied, currentValue)
  }

  if (trigger.kind === 'list_membership') {
    const ev = ctx.listMembershipEvent(trigger.listId)
    let satisfied = false
    if (ev) {
      satisfied =
        trigger.event === 'any_change' ? true : ev === trigger.event
    }
    return edgeWrite(trigger, prevSatisfied, satisfied, currentValue)
  }

  return { triggerId: 'unknown', satisfied: false }
}

function edgeWrite(
  trigger: L2ParamTrigger,
  prevSatisfied: boolean,
  satisfied: boolean,
  currentValue: L2ParamValue,
): TriggerEvalResult {
  const enforce = trigger.enforce ?? 'boundaries'
  if (satisfied) {
    if (enforce === 'continuous') {
      if (!valuesEqual(currentValue, trigger.activeValue)) {
        return { triggerId: trigger.id, satisfied: true, write: trigger.activeValue }
      }
      return { triggerId: trigger.id, satisfied: true }
    }
    if (!prevSatisfied) {
      return { triggerId: trigger.id, satisfied: true, write: trigger.activeValue }
    }
    return { triggerId: trigger.id, satisfied: true }
  }
  if (prevSatisfied && trigger.inactiveValue !== undefined) {
    if (!valuesEqual(currentValue, trigger.inactiveValue)) {
      return { triggerId: trigger.id, satisfied: false, write: trigger.inactiveValue }
    }
  }
  return { triggerId: trigger.id, satisfied: false }
}

export type ParamTriggerTickResult = {
  feed: FeedConfig
  changed: string[]
}

/** Apply all native Param triggers for a feed (time + activity + author + list). */
export function tickParamTriggersForFeed(
  feed: FeedConfig,
  ctx: ParamTriggerTickContext,
): ParamTriggerTickResult {
  const controls = collectParamControls(feed.match).filter(
    (c) => triggersForControl(c).length > 0,
  )
  if (controls.length === 0) return { feed, changed: [] }

  const tz = feed.timezone?.trim() || DEFAULT_FEED_TIMEZONE
  const runtime = feed.paramTriggerRuntime ?? {}
  const timeState = { ...(runtime.time ?? feed.paramScheduleRuntime?.byParam ?? {}) }
  const thresholdState = { ...(runtime.threshold ?? {}) }

  let match = feed.match
  const changed = new Set<string>()

  for (const control of controls) {
    const triggers = triggersForControl(control)
    let write: L2ParamValue | undefined
    for (const trigger of triggers) {
      const prev = thresholdState[trigger.id]
      const prevTime = timeState[control.name]
      const result = evaluateTrigger({
        trigger,
        control,
        prevSatisfied: prev?.satisfied ?? false,
        prevTimeInWindow: prevTime?.inWindow,
        prevTimeWindowId: prevTime?.windowId,
        currentValue: currentParamValue(match, control.name, control),
        ctx,
        timeZone: tz,
      })
      thresholdState[trigger.id] = { satisfied: result.satisfied }
      if (trigger.kind === 'time_window' && result.timeState) {
        timeState[control.name] = result.timeState
      }
      if (result.write !== undefined) write = result.write
    }
    if (write !== undefined) {
      match = setParamValueAcrossMatch(match, control.name, write)
      changed.add(control.name)
    }
  }

  const nextRuntime = { time: timeState, threshold: thresholdState }
  const prevJson = JSON.stringify(feed.paramTriggerRuntime ?? feed.paramScheduleRuntime)
  const nextJson = JSON.stringify(nextRuntime)
  if (changed.size === 0 && prevJson === nextJson) {
    return { feed, changed: [] }
  }

  return {
    feed: {
      ...feed,
      match,
      paramTriggerRuntime: nextRuntime,
      paramScheduleRuntime: { byParam: timeState },
    },
    changed: [...changed],
  }
}
