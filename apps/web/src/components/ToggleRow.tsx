import { ToggleSwitch } from './ToggleSwitch'

interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  hint?: string
  disabled?: boolean
  readOnly?: boolean
  /** On, but another Param AND-blocks some overlapping effects (amber only). */
  andBlocked?: boolean
  /** Showing a live Parameter override (override_when_on mode). */
  paramLive?: boolean
  /** Param value driven by production (trigger or API), not draft. */
  paramProduction?: boolean
  nodeAuthored?: boolean
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
  paramLive,
  paramProduction,
  nodeAuthored,
}: Props) {
  return (
    <div
      className={`toggle-row${andBlocked && checked ? ' is-and-blocked' : ''}${
        paramLive ? ' is-param-live' : ''
      }${paramProduction ? ' is-param-production' : ''}${
        nodeAuthored ? ' is-node-authored' : ''
      }`}
    >
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
        andBlocked={andBlocked}
        paramLive={paramLive}
        paramProduction={paramProduction}
        nodeAuthored={nodeAuthored}
      />
    </div>
  )
}
