import { ToggleSwitch } from './ToggleSwitch'
import type { ParamAndBlockInfo } from '@cfb/l2-graph'
import { formatParamAndBlockHint } from '@cfb/l2-graph'

interface Props {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  hint?: string
  disabled?: boolean
  readOnly?: boolean
  /** On, but another Param AND-blocks some/all overlapping effects. */
  andBlocked?: boolean
  andBlockInfo?: ParamAndBlockInfo
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
  andBlockInfo,
}: Props) {
  const blockHint =
    andBlocked && checked && andBlockInfo
      ? formatParamAndBlockHint(andBlockInfo)
      : andBlocked && checked
        ? 'On — some targets blocked by another Param (AND); others may still apply'
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
