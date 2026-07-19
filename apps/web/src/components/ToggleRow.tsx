import { ToggleSwitch } from './ToggleSwitch'

interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  hint?: string
  disabled?: boolean
  readOnly?: boolean
  /** On, but another Param AND-blocks the effect. */
  andBlocked?: boolean
  andBlockedBy?: string[]
}

export function ToggleRow({
  label,
  checked,
  onChange,
  ariaLabel,
  hint,
  disabled,
  readOnly,
  andBlocked,
  andBlockedBy,
}: Props) {
  const blockHint =
    andBlocked && checked && andBlockedBy && andBlockedBy.length > 0
      ? `On, but blocked by ${andBlockedBy.join(', ')} (AND)`
      : andBlocked && checked
        ? 'On, but blocked by another Param (AND)'
        : undefined
  return (
    <div className={`toggle-row${andBlocked && checked ? ' is-and-blocked' : ''}`}>
      <div className="toggle-row-label">
        <span>{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
        {blockHint ? <span className="toggle-row-and-block">{blockHint}</span> : null}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
        readOnly={readOnly}
        andBlocked={andBlocked}
      />
    </div>
  )
}
