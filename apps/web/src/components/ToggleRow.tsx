import { ToggleSwitch } from './ToggleSwitch'

interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  hint?: string
  disabled?: boolean
  readOnly?: boolean
}

export function ToggleRow({ label, checked, onChange, ariaLabel, hint, disabled, readOnly }: Props) {
  return (
    <div className="toggle-row">
      <div className="toggle-row-label">
        <span>{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        ariaLabel={ariaLabel}
        disabled={disabled}
        readOnly={readOnly}
      />
    </div>
  )
}
