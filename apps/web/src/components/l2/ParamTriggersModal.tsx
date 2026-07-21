import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import type {
  L2ParamControl,
  L2ParamScheduleEnforce,
  L2ParamTrigger,
  L2ParamTriggerKind,
  L2ParamValue,
  L2RuleGroup,
} from '@cfb/core-types'
import { triggersForControl } from '../../lib/param-triggers-ui'
import { defaultListenScope } from '../../lib/param-trigger-listen'

import { FEED_TIMEZONE_OPTIONS, normalizeFeedTimezone } from '../../lib/timezones'
import { ParamTriggerListenSelect } from './ParamTriggerListenSelect'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TRIGGER_TABS: { kind: L2ParamTriggerKind; label: string; hint: string }[] = [
  { kind: 'time_window', label: 'Time', hint: 'Calendar + clock windows in feed timezone.' },
  {
    kind: 'match_rate',
    label: 'Match rate',
    hint: 'When match volume crosses a threshold — pick what to listen to (whole feed or a node).',
  },
  {
    kind: 'staleness',
    label: 'Staleness',
    hint: 'When nothing has matched for a while — separate from match rate = 0.',
  },
  { kind: 'author_post', label: 'Author', hint: 'When a watched author posts to this feed.' },
  { kind: 'list_membership', label: 'List', hint: 'When a Bluesky list gains or loses members.' },
]

function newTriggerId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function defaultInactiveValue(control: L2ParamControl): L2ParamValue | undefined {
  if (control.type === 'boolean') return false
  if (control.type === 'enum') return control.default
  return undefined
}

function defaultActiveValue(control: L2ParamControl): L2ParamValue {
  if (control.type === 'boolean') return true
  if (control.type === 'enum') return String(control.default ?? control.options?.[0]?.value ?? '')
  return control.default
}

function ValueSelect({
  control,
  value,
  readOnly,
  onChange,
  allowSkip,
}: {
  control: L2ParamControl
  value: L2ParamValue | undefined
  readOnly?: boolean
  onChange: (v: L2ParamValue | undefined) => void
  allowSkip?: boolean
}) {
  if (control.type === 'boolean') {
    return (
      <select
        disabled={readOnly}
        value={
          value === undefined && allowSkip
            ? 'skip'
            : value === true || value === 'true'
              ? 'on'
              : 'off'
        }
        onChange={(e) => {
          if (e.target.value === 'skip') onChange(undefined)
          else onChange(e.target.value === 'on')
        }}
      >
        {allowSkip ? <option value="skip">Don&apos;t write (last wins)</option> : null}
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    )
  }
  return (
    <select
      disabled={readOnly}
      value={value === undefined && allowSkip ? 'skip' : String(value)}
      onChange={(e) => {
        if (e.target.value === 'skip') onChange(undefined)
        else onChange(e.target.value)
      }}
    >
      {allowSkip ? <option value="skip">Don&apos;t write (last wins)</option> : null}
      {(control.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label || o.value}
        </option>
      ))}
    </select>
  )
}

function EnforceSelect({
  value,
  readOnly,
  onChange,
}: {
  value: L2ParamScheduleEnforce | undefined
  readOnly?: boolean
  onChange: (v: L2ParamScheduleEnforce) => void
}) {
  return (
    <select
      disabled={readOnly}
      value={value ?? 'boundaries'}
      onChange={(e) => onChange(e.target.value as L2ParamScheduleEnforce)}
    >
      <option value="boundaries">Once at threshold cross</option>
      <option value="continuous">Every minute while active</option>
    </select>
  )
}

export function ParamTriggersModal({
  open,
  control,
  match,
  nodeLabels,
  feedTimezone,
  readOnly,
  onChange,
  onFeedTimezoneChange,
  onClose,
}: {
  open: boolean
  control: L2ParamControl
  match: L2RuleGroup
  nodeLabels?: Record<string, string>
  feedTimezone: string
  readOnly?: boolean
  onChange: (triggers: L2ParamTrigger[]) => void
  onFeedTimezoneChange?: (tz: string) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<L2ParamTriggerKind>('time_window')

  const allTriggers = useMemo(
    () => triggersForControl({ ...control, triggers: control.triggers ?? [] }),
    [control],
  )

  if (!open) return null

  const canTrigger = control.type === 'boolean' || control.type === 'enum'
  const tz = normalizeFeedTimezone(feedTimezone)

  const patchTriggers = (next: L2ParamTrigger[]) => onChange(next)

  const triggersOfKind = <K extends L2ParamTriggerKind>(kind: K) =>
    allTriggers.filter((t): t is Extract<L2ParamTrigger, { kind: K }> => t.kind === kind)

  const replaceKind = (kind: L2ParamTriggerKind, rows: L2ParamTrigger[]) => {
    const rest = allTriggers.filter((t) => t.kind !== kind)
    patchTriggers([...rest, ...rows])
  }

  const updateTrigger = (id: string, partial: Partial<L2ParamTrigger>) => {
    patchTriggers(allTriggers.map((t) => (t.id === id ? ({ ...t, ...partial } as L2ParamTrigger) : t)))
  }

  const removeTrigger = (id: string) => {
    patchTriggers(allTriggers.filter((t) => t.id !== id))
  }

  const addTimeWindow = () => {
    replaceKind('time_window', [
      ...triggersOfKind('time_window'),
      {
        kind: 'time_window',
        id: newTriggerId('time'),
        label: '',
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: '06:00',
        endTime: '10:00',
        startDate: undefined,
        endDate: undefined,
        activeValue: defaultActiveValue(control),
        inactiveValue: defaultInactiveValue(control),
        enforce: 'boundaries',
      },
    ])
  }

  const addMatchRate = () => {
    const listen = defaultListenScope(control)
    replaceKind('match_rate', [
      ...triggersOfKind('match_rate'),
      {
        kind: 'match_rate',
        id: newTriggerId('rate'),
        scope: listen.scope,
        nodeId: listen.nodeId,
        windowMinutes: 60,
        comparator: 'gte',
        threshold: 10,
        activeValue: defaultActiveValue(control),
        inactiveValue: defaultInactiveValue(control),
        enforce: 'boundaries',
      },
    ])
  }

  const addStaleness = () => {
    const listen = defaultListenScope(control)
    replaceKind('staleness', [
      ...triggersOfKind('staleness'),
      {
        kind: 'staleness',
        id: newTriggerId('stale'),
        scope: listen.scope,
        nodeId: listen.nodeId,
        staleMinutes: 60,
        activeValue: defaultActiveValue(control),
        inactiveValue: defaultInactiveValue(control),
        enforce: 'boundaries',
      },
    ])
  }

  const addAuthorPost = () => {
    replaceKind('author_post', [
      ...triggersOfKind('author_post'),
      {
        kind: 'author_post',
        id: newTriggerId('author'),
        authorDids: [],
        authorListIds: [],
        lookbackMinutes: 5,
        activeValue: defaultActiveValue(control),
        inactiveValue: defaultInactiveValue(control),
        enforce: 'boundaries',
      },
    ])
  }

  const addListMembership = () => {
    replaceKind('list_membership', [
      ...triggersOfKind('list_membership'),
      {
        kind: 'list_membership',
        id: newTriggerId('list'),
        listId: '',
        event: 'any_change',
        activeValue: defaultActiveValue(control),
        inactiveValue: defaultInactiveValue(control),
        enforce: 'boundaries',
      },
    ])
  }

  const tabMeta = TRIGGER_TABS.find((t) => t.kind === tab)!

  return createPortal(
    <div
      className="l2-param-modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="l2-param-modal l2-param-triggers-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="param-triggers-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="param-triggers-title">Param triggers</h3>
        <p className="card-hint">
          <strong>Controls</strong> (targets on this Param) change the graph when the value flips.{' '}
          <strong>Triggers</strong> here listen for activity and flip <strong>{control.label || control.name}</strong>{' '}
          automatically — they can watch the same node, a different node, or the whole feed.
        </p>

        <label className="l2-inspector-field">
          Feed timezone
          <select
            disabled={readOnly || !onFeedTimezoneChange}
            value={FEED_TIMEZONE_OPTIONS.some((o) => o.value === tz) ? tz : '__custom__'}
            onChange={(e) => {
              if (e.target.value !== '__custom__') onFeedTimezoneChange?.(e.target.value)
            }}
          >
            {FEED_TIMEZONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {!FEED_TIMEZONE_OPTIONS.some((o) => o.value === tz) ? (
              <option value="__custom__">{tz} (custom)</option>
            ) : null}
          </select>
          {!FEED_TIMEZONE_OPTIONS.some((o) => o.value === tz) ? (
            <input
              className="mono"
              disabled={readOnly || !onFeedTimezoneChange}
              value={tz}
              onChange={(e) => onFeedTimezoneChange?.(e.target.value.trim() || 'UTC')}
            />
          ) : null}
        </label>

        {!canTrigger ? (
          <p className="card-hint">Triggers support boolean and enum Params.</p>
        ) : (
          <>
            <div className="l2-param-trigger-tabs" role="tablist">
              {TRIGGER_TABS.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.kind}
                  className={`btn btn-ghost btn-sm${tab === t.kind ? ' active' : ''}`}
                  onClick={() => setTab(t.kind)}
                >
                  {t.label}
                  {triggersOfKind(t.kind).length > 0 ? (
                    <span className="l2-param-triggers-count">{triggersOfKind(t.kind).length}</span>
                  ) : null}
                </button>
              ))}
            </div>
            <p className="card-hint">{tabMeta.hint}</p>

            {tab === 'time_window' ? (
              <div className="l2-param-schedule-list">
                {triggersOfKind('time_window').length === 0 ? (
                  <p className="card-hint">No time windows yet.</p>
                ) : null}
                {triggersOfKind('time_window').map((w) => (
                  <div key={w.id} className="l2-param-schedule-row">
                    <div className="l2-param-schedule-row-head">
                      <input
                        className="l2-param-schedule-label"
                        disabled={readOnly}
                        placeholder="Label (optional)"
                        value={w.label ?? ''}
                        onChange={(e) => updateTrigger(w.id, { label: e.target.value })}
                      />
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label="Remove trigger"
                          onClick={() => removeTrigger(w.id)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div className="l2-param-schedule-days">
                      {DAY_LABELS.map((label, day) => {
                        const days = w.daysOfWeek ?? []
                        const on = days.length === 0 || days.includes(day)
                        return (
                          <label key={label} className="l2-param-schedule-day">
                            <input
                              type="checkbox"
                              disabled={readOnly}
                              checked={on}
                              onChange={(e) => {
                                const base = days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : [...days]
                                const next = e.target.checked
                                  ? [...new Set([...base, day])].sort()
                                  : base.filter((d) => d !== day)
                                updateTrigger(w.id, { daysOfWeek: next })
                              }}
                            />
                            {label}
                          </label>
                        )
                      })}
                    </div>
                    <div className="l2-param-schedule-times">
                      <label>
                        Start date
                        <input
                          type="date"
                          disabled={readOnly}
                          value={w.startDate ?? ''}
                          onChange={(e) =>
                            updateTrigger(w.id, { startDate: e.target.value || undefined })
                          }
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          disabled={readOnly}
                          value={w.endDate ?? ''}
                          onChange={(e) =>
                            updateTrigger(w.id, { endDate: e.target.value || undefined })
                          }
                        />
                      </label>
                      <label>
                        Start time
                        <input
                          type="time"
                          disabled={readOnly}
                          value={w.startTime}
                          onChange={(e) => updateTrigger(w.id, { startTime: e.target.value })}
                        />
                      </label>
                      <label>
                        End time
                        <input
                          type="time"
                          disabled={readOnly}
                          value={w.endTime}
                          onChange={(e) => updateTrigger(w.id, { endTime: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="l2-param-schedule-values">
                      <label>
                        When active
                        <ValueSelect
                          control={control}
                          value={w.activeValue}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(w.id, { activeValue: v! })}
                        />
                      </label>
                      <label>
                        When inactive
                        <ValueSelect
                          control={control}
                          value={w.inactiveValue}
                          readOnly={readOnly}
                          allowSkip
                          onChange={(v) => updateTrigger(w.id, { inactiveValue: v })}
                        />
                      </label>
                      <label>
                        Apply mode
                        <select
                          disabled={readOnly}
                          value={w.enforce ?? 'boundaries'}
                          onChange={(e) =>
                            updateTrigger(w.id, {
                              enforce: e.target.value as L2ParamScheduleEnforce,
                            })
                          }
                        >
                          <option value="boundaries">Once at start/end</option>
                          <option value="continuous">Every minute while active</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === 'match_rate' ? (
              <div className="l2-param-schedule-list">
                {triggersOfKind('match_rate').map((t) => (
                  <div key={t.id} className="l2-param-schedule-row">
                    <div className="l2-param-schedule-row-head">
                      <input
                        className="l2-param-schedule-label"
                        disabled={readOnly}
                        placeholder="Label"
                        value={t.label ?? ''}
                        onChange={(e) => updateTrigger(t.id, { label: e.target.value })}
                      />
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTrigger(t.id)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div className="l2-param-schedule-values">
                      <ParamTriggerListenSelect
                        control={control}
                        match={match}
                        nodeLabels={nodeLabels}
                        kind="match_rate"
                        scope={t.scope ?? 'feed'}
                        nodeId={t.nodeId}
                        readOnly={readOnly}
                        onChange={(listen) => updateTrigger(t.id, listen)}
                      />
                      <label>
                        Window (minutes)
                        <input
                          type="number"
                          min={1}
                          disabled={readOnly}
                          value={t.windowMinutes}
                          onChange={(e) =>
                            updateTrigger(t.id, { windowMinutes: Number(e.target.value) || 60 })
                          }
                        />
                      </label>
                      <label>
                        When matches
                        <select
                          disabled={readOnly}
                          value={t.comparator}
                          onChange={(e) =>
                            updateTrigger(t.id, {
                              comparator: e.target.value as typeof t.comparator,
                            })
                          }
                        >
                          <option value="gte">≥</option>
                          <option value="gt">&gt;</option>
                          <option value="lte">≤</option>
                          <option value="lt">&lt;</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          disabled={readOnly}
                          value={t.threshold}
                          onChange={(e) =>
                            updateTrigger(t.id, { threshold: Number(e.target.value) || 0 })
                          }
                        />
                      </label>
                      <label>
                        Active value
                        <ValueSelect
                          control={control}
                          value={t.activeValue}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { activeValue: v! })}
                        />
                      </label>
                      <label>
                        Inactive value
                        <ValueSelect
                          control={control}
                          value={t.inactiveValue}
                          readOnly={readOnly}
                          allowSkip
                          onChange={(v) => updateTrigger(t.id, { inactiveValue: v })}
                        />
                      </label>
                      <label>
                        Apply mode
                        <EnforceSelect
                          value={t.enforce}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { enforce: v })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === 'staleness' ? (
              <div className="l2-param-schedule-list">
                {triggersOfKind('staleness').map((t) => (
                  <div key={t.id} className="l2-param-schedule-row">
                    <div className="l2-param-schedule-row-head">
                      <input
                        className="l2-param-schedule-label"
                        disabled={readOnly}
                        value={t.label ?? ''}
                        placeholder="Label"
                        onChange={(e) => updateTrigger(t.id, { label: e.target.value })}
                      />
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTrigger(t.id)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div className="l2-param-schedule-values">
                      <ParamTriggerListenSelect
                        control={control}
                        match={match}
                        nodeLabels={nodeLabels}
                        kind="staleness"
                        scope={t.scope ?? 'feed'}
                        nodeId={t.nodeId}
                        readOnly={readOnly}
                        onChange={(listen) => updateTrigger(t.id, listen)}
                      />
                      <label>
                        Stale after (minutes)
                        <input
                          type="number"
                          min={1}
                          disabled={readOnly}
                          value={t.staleMinutes}
                          onChange={(e) =>
                            updateTrigger(t.id, { staleMinutes: Number(e.target.value) || 60 })
                          }
                        />
                      </label>
                      <label>
                        Active value
                        <ValueSelect
                          control={control}
                          value={t.activeValue}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { activeValue: v! })}
                        />
                      </label>
                      <label>
                        Inactive value
                        <ValueSelect
                          control={control}
                          value={t.inactiveValue}
                          readOnly={readOnly}
                          allowSkip
                          onChange={(v) => updateTrigger(t.id, { inactiveValue: v })}
                        />
                      </label>
                      <label>
                        Apply mode
                        <EnforceSelect
                          value={t.enforce}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { enforce: v })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === 'author_post' ? (
              <div className="l2-param-schedule-list">
                {triggersOfKind('author_post').map((t) => (
                  <div key={t.id} className="l2-param-schedule-row">
                    <div className="l2-param-schedule-row-head">
                      <input
                        className="l2-param-schedule-label"
                        disabled={readOnly}
                        value={t.label ?? ''}
                        placeholder="Label"
                        onChange={(e) => updateTrigger(t.id, { label: e.target.value })}
                      />
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTrigger(t.id)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div className="l2-param-schedule-values">
                      <label>
                        Author DIDs (comma-separated)
                        <input
                          className="mono"
                          disabled={readOnly}
                          value={(t.authorDids ?? []).join(', ')}
                          onChange={(e) =>
                            updateTrigger(t.id, {
                              authorDids: e.target.value
                                .split(/[,\s]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label>
                        Author list IDs
                        <input
                          className="mono"
                          disabled={readOnly}
                          value={(t.authorListIds ?? []).join(', ')}
                          onChange={(e) =>
                            updateTrigger(t.id, {
                              authorListIds: e.target.value
                                .split(/[,\s]+/)
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label>
                        Lookback (minutes)
                        <input
                          type="number"
                          min={1}
                          disabled={readOnly}
                          value={t.lookbackMinutes ?? 5}
                          onChange={(e) =>
                            updateTrigger(t.id, {
                              lookbackMinutes: Number(e.target.value) || 5,
                            })
                          }
                        />
                      </label>
                      <label>
                        Active value
                        <ValueSelect
                          control={control}
                          value={t.activeValue}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { activeValue: v! })}
                        />
                      </label>
                      <label>
                        Inactive value
                        <ValueSelect
                          control={control}
                          value={t.inactiveValue}
                          readOnly={readOnly}
                          allowSkip
                          onChange={(v) => updateTrigger(t.id, { inactiveValue: v })}
                        />
                      </label>
                      <label>
                        Apply mode
                        <EnforceSelect
                          value={t.enforce}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { enforce: v })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === 'list_membership' ? (
              <div className="l2-param-schedule-list">
                {triggersOfKind('list_membership').map((t) => (
                  <div key={t.id} className="l2-param-schedule-row">
                    <div className="l2-param-schedule-row-head">
                      <input
                        className="l2-param-schedule-label"
                        disabled={readOnly}
                        value={t.label ?? ''}
                        placeholder="Label"
                        onChange={(e) => updateTrigger(t.id, { label: e.target.value })}
                      />
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTrigger(t.id)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div className="l2-param-schedule-values">
                      <label>
                        List ID / at:// URI
                        <input
                          className="mono"
                          disabled={readOnly}
                          value={t.listId}
                          onChange={(e) => updateTrigger(t.id, { listId: e.target.value.trim() })}
                        />
                      </label>
                      <label>
                        Event
                        <select
                          disabled={readOnly}
                          value={t.event}
                          onChange={(e) =>
                            updateTrigger(t.id, {
                              event: e.target.value as typeof t.event,
                            })
                          }
                        >
                          <option value="any_change">Any change</option>
                          <option value="member_added">Member added</option>
                          <option value="member_removed">Member removed</option>
                        </select>
                      </label>
                      <label>
                        Active value
                        <ValueSelect
                          control={control}
                          value={t.activeValue}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { activeValue: v! })}
                        />
                      </label>
                      <label>
                        Inactive value
                        <ValueSelect
                          control={control}
                          value={t.inactiveValue}
                          readOnly={readOnly}
                          allowSkip
                          onChange={(v) => updateTrigger(t.id, { inactiveValue: v })}
                        />
                      </label>
                      <label>
                        Apply mode
                        <EnforceSelect
                          value={t.enforce}
                          readOnly={readOnly}
                          onChange={(v) => updateTrigger(t.id, { enforce: v })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        <div className="l2-param-modal-actions">
          {canTrigger && !readOnly ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (tab === 'time_window') addTimeWindow()
                else if (tab === 'match_rate') addMatchRate()
                else if (tab === 'staleness') addStaleness()
                else if (tab === 'author_post') addAuthorPost()
                else if (tab === 'list_membership') addListMembership()
              }}
            >
              Add {tabMeta.label.toLowerCase()} trigger
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Clock icon button for Param control cards. */
export function ParamTriggersButton({
  scheduleCount,
  onClick,
  title = 'Param triggers',
}: {
  scheduleCount: number
  onClick?: () => void
  title?: string
}) {
  if (!onClick) return null
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm l2-param-triggers-btn${scheduleCount > 0 ? ' has-schedules' : ''}`}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      ⏱
      {scheduleCount > 0 ? (
        <span className="l2-param-triggers-count">{scheduleCount}</span>
      ) : null}
    </button>
  )
}
