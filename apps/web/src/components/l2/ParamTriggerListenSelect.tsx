import type { L2ParamControl, L2ParamListenScope, L2RuleGroup } from '@cfb/core-types'

import {
  buildListenPickerOptions,
  isOtherListenNode,
  listenPickerHint,
  listenPickerValue,
  listenScopeFromPicker,
  LISTEN_PICKER_OTHER,
  type ListenPickerValue,
} from '../../lib/param-trigger-listen'

export function ParamTriggerListenSelect({
  control,
  match,
  nodeLabels,
  kind,
  scope,
  nodeId,
  readOnly,
  onChange,
}: {
  control: L2ParamControl
  match: L2RuleGroup
  nodeLabels?: Record<string, string>
  kind: 'match_rate' | 'staleness'
  scope: L2ParamListenScope
  nodeId?: string
  readOnly?: boolean
  onChange: (next: { scope: L2ParamListenScope; nodeId?: string }) => void
}) {
  const options = buildListenPickerOptions({ control, match, nodeLabels, kind })
  const selectValue = listenPickerValue(control, scope, nodeId)
  const showOtherId =
    selectValue === LISTEN_PICKER_OTHER ||
    (scope === 'node' && isOtherListenNode(control, nodeId))

  const groups: { key: string; label: string; items: typeof options }[] = [
    { key: 'feed', label: 'Feed', items: options.filter((o) => o.group === 'feed') },
    {
      key: 'bound',
      label: 'Bound targets (this Param controls)',
      items: options.filter((o) => o.group === 'bound'),
    },
    { key: 'aggregate', label: 'Combined', items: options.filter((o) => o.group === 'aggregate') },
    { key: 'other', label: 'Other', items: options.filter((o) => o.group === 'other') },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="l2-param-listen-field">
      <label>
        Listen to
        <select
          disabled={readOnly}
          value={selectValue}
          title={listenPickerHint(kind)}
          onChange={(e) => {
            const next = listenScopeFromPicker(e.target.value as ListenPickerValue)
            if (e.target.value === LISTEN_PICKER_OTHER && nodeId && isOtherListenNode(control, nodeId)) {
              onChange({ scope: 'node', nodeId })
              return
            }
            onChange(next)
          }}
        >
          {groups.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.items.map((o) => (
                <option key={String(o.value)} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {showOtherId ? (
        <label>
          Node id
          <input
            className="mono"
            disabled={readOnly}
            placeholder="Paste node id"
            value={nodeId ?? ''}
            onChange={(e) => onChange({ scope: 'node', nodeId: e.target.value.trim() })}
          />
        </label>
      ) : null}
      <span className="card-hint">{listenPickerHint(kind)}</span>
    </div>
  )
}
