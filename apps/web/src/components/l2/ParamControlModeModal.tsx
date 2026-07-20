import { createPortal } from 'react-dom'
import type { L2ParamControlMode } from '@cfb/core-types'

export function ParamControlModeModal({
  open,
  mode,
  readOnly,
  onChange,
  onClose,
}: {
  open: boolean
  mode: L2ParamControlMode
  readOnly?: boolean
  onChange: (mode: L2ParamControlMode) => void
  onClose: () => void
}) {
  if (!open) return null

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
        className="l2-param-modal l2-param-control-mode-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="param-control-mode-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="param-control-mode-title">Parameter control</h3>
        <p className="card-hint">
          How Parameters interact with this node&apos;s settings. Same for every Param that targets
          this node.
        </p>

        <div className="l2-param-control-mode-options">
          <label className="l2-param-control-mode-option">
            <input
              type="radio"
              name="param-control-mode"
              value="override_when_on"
              checked={mode === 'override_when_on'}
              disabled={readOnly}
              onChange={() => onChange('override_when_on')}
            />
            <span className="l2-param-control-mode-option-body">
              <strong>Override when on</strong> (default)
              <span className="card-hint">
                Node settings stay editable. When a Param toggle is on, it overrides the bound
                fields. When off, the node&apos;s own values are used — same idea as terms.
              </span>
            </span>
          </label>

          <label className="l2-param-control-mode-option">
            <input
              type="radio"
              name="param-control-mode"
              value="full_control"
              checked={mode === 'full_control'}
              disabled={readOnly}
              onChange={() => onChange('full_control')}
            />
            <span className="l2-param-control-mode-option-body">
              <strong>Full control</strong>
              <span className="card-hint">
                Parameters own bound fields completely. ON and OFF both write values (OFF uses the
                opposite pole). Node controls for those fields are locked while bound.
              </span>
            </span>
          </label>
        </div>

        <div className="l2-param-modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Clickable Param badge — canvas head and properties panel. */
export function ParamTargetBadge({
  title = 'How Parameters control this node',
  onClick,
}: {
  title?: string
  onClick?: () => void
}) {
  if (!onClick) {
    return (
      <span className="l2-flow-condition-param-badge" title={title}>
        Param
      </span>
    )
  }
  return (
    <button
      type="button"
      className="l2-flow-condition-param-badge l2-flow-condition-param-badge--btn"
      title={title}
      aria-label="Parameter control settings"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      Param
    </button>
  )
}
