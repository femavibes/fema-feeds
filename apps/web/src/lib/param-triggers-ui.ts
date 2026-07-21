import type {
  L2ParamControl,
  L2ParamScheduleWindow,
  L2ParamTrigger,
  L2ParamTimeWindowTrigger,
} from '@cfb/core-types'

/** Merge legacy schedules into unified triggers (UI-only; mirrors l2-graph). */
export function triggersForControl(control: L2ParamControl): L2ParamTrigger[] {
  const out: L2ParamTrigger[] = [...(control.triggers ?? [])]
  for (const s of control.schedules ?? []) {
    out.push(scheduleWindowToTrigger(s))
  }
  return out
}

function scheduleWindowToTrigger(s: L2ParamScheduleWindow): L2ParamTimeWindowTrigger {
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
