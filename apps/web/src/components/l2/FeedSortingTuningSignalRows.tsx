import type { EngagementSignal } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'

interface SignalDef {
  key: string
  label: string
  hint: string
}

interface Props {
  signals: SignalDef[]
  values: Record<string, EngagementSignal>
  weightPrefix?: '×' | '+'
  onChange: (key: string, patch: Partial<EngagementSignal>) => void
  disabled?: boolean
}

export function FeedSortingTuningSignalRows({
  signals,
  values,
  weightPrefix = '×',
  onChange,
  disabled,
}: Props) {
  return (
    <>
      {signals.map((sig) => {
        const signal = values[sig.key] ?? { enabled: false, weight: 0 }
        return (
          <div key={sig.key} className="feed-sorting-signal-row">
            <ToggleRow
              label={sig.label}
              hint={sig.hint}
              checked={signal.enabled}
              onChange={(on) => onChange(sig.key, { enabled: on })}
              ariaLabel={sig.hint || sig.label}
              disabled={disabled}
            />
            <label className="feed-sorting-weight-input">
              {signal.enabled ? (
                <>
                  <span className="feed-sorting-weight-label">{weightPrefix}</span>
                  <input
                    type="number"
                    min={weightPrefix === '+' ? 0 : undefined}
                    step="1"
                    value={signal.weight}
                    disabled={disabled}
                    onChange={(e) => {
                      const w = weightPrefix === '+'
                        ? Math.max(0, parseInt(e.target.value) || 0)
                        : parseInt(e.target.value) || 0
                      onChange(sig.key, { weight: w })
                    }}
                  />
                </>
              ) : null}
            </label>
          </div>
        )
      })}
    </>
  )
}
