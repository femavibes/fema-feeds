interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  disabled?: boolean
  readOnly?: boolean
  compact?: boolean
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled,
  readOnly = false,
  compact = true,
}: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-readonly={readOnly || undefined}
      className={`toggle-switch ${compact ? 'toggle-switch-compact' : ''} ${checked ? 'on' : ''}${
        readOnly ? ' toggle-switch-readonly' : ''
      }`}
      disabled={disabled && !readOnly}
      onClick={() => {
        if (readOnly || disabled) return
        onChange(!checked)
      }}
    >
      <span className="toggle-knob" />
      {!compact ? <span className="toggle-text">{checked ? 'On' : 'Off'}</span> : null}
    </button>
  )
}
