import type { EngagementWeights } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'

interface Props {
  signals: { key: string; label: string }[]
  weights: EngagementWeights
  onChange: (key: string, signal: { enabled: boolean; weight: number }) => void
  disabled?: boolean
}

export function FeedSortingSignalRows({ signals, weights, onChange, disabled }: Props) {
  return (
    <>
      {signals.map((sig) => {
        const signal = (weights as unknown as Record<string, { enabled: boolean; weight: number }>)[sig.key]
          ?? { enabled: false, weight: 1 }
        return (
          <div key={sig.key} className="feed-sorting-signal-row">
            <ToggleRow
              label={sig.label}
              hint=""
              checked={signal.enabled}
              onChange={(on) => onChange(sig.key, { ...signal, enabled: on })}
              ariaLabel={`Include ${sig.label.toLowerCase()}`}
              disabled={disabled}
            />
            <label className="feed-sorting-weight-input">
              {signal.enabled ? (
                <>
                  <span className="feed-sorting-weight-label">×</span>
                  <input
                    type="number"
                    step="1"
                    value={signal.weight}
                    disabled={disabled}
                    onChange={(e) => {
                      const w = parseInt(e.target.value) || 0
                      onChange(sig.key, { ...signal, weight: w })
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
