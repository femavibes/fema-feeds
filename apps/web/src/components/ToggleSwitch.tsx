interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  disabled?: boolean
  compact?: boolean
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
  compact = true,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`toggle-switch ${compact ? 'toggle-switch-compact' : ''} ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
      {!compact ? <span className="toggle-text">{checked ? 'On' : 'Off'}</span> : null}
    </button>
  )
}
