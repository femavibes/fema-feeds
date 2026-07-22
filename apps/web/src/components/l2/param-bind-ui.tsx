import type { ParamBindableField } from '@cfb/l2-graph'

/** Member-array binds (search fields, URL sources, …) use On/Off — not Include/Exclude. */
export function memberArrayWhenOnLabels(
  field: Pick<ParamBindableField, 'property' | 'valueKind' | 'member'>,
): { onLabel: string; offLabel: string } {
  if (field.property === 'fields' || field.property === 'sources' || field.property === 'kinds') {
    return { onLabel: 'On', offLabel: 'Off' }
  }
  if (field.valueKind === 'member' && !field.member) {
    return { onLabel: 'Include in list', offLabel: 'Exclude from list' }
  }
  return { onLabel: 'On', offLabel: 'Off' }
}

/** Pick the property value when the Parameter control is ON (OFF gets the inverse). */
export function WhenControlOnSelect({
  readOnly,
  value,
  onLabel,
  offLabel,
  onValue = 'on',
  offValue = 'off',
  onChange,
}: {
  readOnly?: boolean
  value: string
  onLabel: string
  offLabel: string
  onValue?: string
  offValue?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="l2-param-when-on">
      When control is on
      <select
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={onValue}>{onLabel}</option>
        <option value={offValue}>{offLabel}</option>
      </select>
    </label>
  )
}

/**
 * Node-like select for Param-owned settings. Empty value = not controlled by this Param
 * (clears the binding). Chosen value is what the control writes when ON (OFF uses inverse
 * for binary fields).
 */
export function ParamOwnedSelect({
  label,
  bound,
  value,
  options,
  readOnly,
  title,
  className,
  onUnbind,
  onBindValue,
}: {
  label?: string
  bound: boolean
  value: string
  options: { value: string; label: string }[]
  readOnly?: boolean
  title?: string
  className?: string
  onUnbind: () => void
  onBindValue: (value: string) => void
}) {
  return (
    <label className={`l2-inspector-field ${className ?? ''}`.trim()}>
      {label}
      <select
        disabled={readOnly}
        value={bound ? value : ''}
        title={title}
        onChange={(e) => {
          const next = e.target.value
          if (!next) onUnbind()
          else onBindValue(next)
        }}
      >
        <option value="">Not controlled</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function sortNodeSettingFields(fields: ParamBindableField[]): ParamBindableField[] {
  const rank = (f: ParamBindableField) => {
    if (f.key === 'op') return 0
    if (f.key === 'runAtIngest') return 1
    if (
      f.key === 'caseSensitive' ||
      f.key === 'wholeWord' ||
      f.key === 'caseInsensitive'
    ) {
      return 2
    }
    if (f.property === 'fields' || f.key.startsWith('fields:')) return 4
    if (f.property === 'kinds' || f.property === 'sources') return 4
    return 3
  }
  return [...fields].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

/** Match ConditionRow option wording for common ops (absolute / display). */
export function matchOpSelectOptions(
  field: ParamBindableField,
): { value: string; label: string }[] {
  return (field.enumValues ?? []).map((o) => {
    if (o.value === 'includes' || o.value === 'excludes') return { value: o.value, label: o.value }
    if (o.value === 'matches') return { value: o.value, label: 'matches' }
    if (o.value === 'not_matches') return { value: o.value, label: 'not matches' }
    if (o.value === 'is') return { value: o.value, label: 'is' }
    if (o.value === 'is_not') return { value: o.value, label: 'is not' }
    return { value: o.value, label: o.label }
  })
}

/** Toggle polarity options: make ON/OFF pairing explicit. */
export function polarityPairOptions(
  onValue: string,
  offValue: string,
  onLabel: string,
  offLabel: string,
): { value: string; label: string }[] {
  return [
    { value: onValue, label: `ON: ${onLabel} · OFF: ${offLabel}` },
    { value: offValue, label: `ON: ${offLabel} · OFF: ${onLabel}` },
  ]
}

export const DISCOVER_MODE_OPTIONS = polarityPairOptions(
  'true',
  'false',
  'Discover',
  'Filter',
)
