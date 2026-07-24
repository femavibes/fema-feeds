import type { EngagementWeights, SortTuning } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'
import {
  CONTENT_SIGNALS,
  ENGAGEMENT_SIGNALS,
  MEDIA_SIGNALS,
  RATIO_SIGNALS,
} from './feed-sorting-signals'
import { FeedSortSharedSection } from './FeedSortSharedSection'
import { FeedSortingSignalRows } from './FeedSortingSignalRows'

interface Props {
  weights: EngagementWeights
  tuning: SortTuning
  formulaLabel: string
  onWeightsChange: (next: EngagementWeights) => void
  onTuningChange: (next: SortTuning) => void
}

function updateMedia(
  tuning: SortTuning,
  key: keyof SortTuning['mediaBonus'],
  patch: Partial<SortTuning['mediaBonus'][typeof key]>,
): SortTuning {
  return {
    ...tuning,
    mediaBonus: {
      ...tuning.mediaBonus,
      [key]: { ...tuning.mediaBonus[key], ...patch },
    },
  }
}

function updateContent(
  tuning: SortTuning,
  key: keyof SortTuning['contentSignals'],
  patch: Partial<SortTuning['contentSignals'][typeof key]>,
): SortTuning {
  return {
    ...tuning,
    contentSignals: {
      ...tuning.contentSignals,
      [key]: { ...tuning.contentSignals[key], ...patch },
    },
  }
}

function updateRatio(
  tuning: SortTuning,
  key: keyof SortTuning['ratioSignals'],
  patch: Partial<SortTuning['ratioSignals'][typeof key]>,
): SortTuning {
  return {
    ...tuning,
    ratioSignals: {
      ...tuning.ratioSignals,
      [key]: { ...tuning.ratioSignals[key], ...patch },
    },
  }
}

export function FeedSortingAdvancedPanel({
  weights,
  tuning,
  formulaLabel,
  onWeightsChange,
  onTuningChange,
}: Props) {
  return (
    <div className="feed-sorting-tuning">
      <div className="feed-sorting-signals">
        <p className="sidebar-block-title">Engagement signals</p>
        <FeedSortingSignalRows
          signals={ENGAGEMENT_SIGNALS}
          weights={weights}
          onChange={(key, signal) => onWeightsChange({ ...weights, [key]: signal })}
        />

        <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Media bonus</p>
        {MEDIA_SIGNALS.map((sig) => {
          const signal = tuning.mediaBonus[sig.key]
          return (
            <div key={sig.key} className="feed-sorting-signal-row">
              <ToggleRow
                label={sig.label}
                hint="Flat bonus added to score when present"
                checked={signal.enabled}
                onChange={(on) => onTuningChange(updateMedia(tuning, sig.key, { enabled: on }))}
                ariaLabel={`Boost ${sig.label.toLowerCase()} posts`}
              />
              <label className="feed-sorting-weight-input">
                {signal.enabled ? (
                  <>
                    <span className="feed-sorting-weight-label">+</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={signal.weight}
                      onChange={(e) => onTuningChange(updateMedia(tuning, sig.key, { weight: Math.max(0, parseInt(e.target.value) || 0) }))}
                    />
                  </>
                ) : null}
              </label>
            </div>
          )
        })}

        <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Content signals</p>
        {CONTENT_SIGNALS.map((sig) => {
          const signal = tuning.contentSignals[sig.key]
          return (
            <div key={sig.key} className="feed-sorting-signal-row">
              <ToggleRow
                label={sig.label}
                hint={sig.hint}
                checked={signal.enabled}
                onChange={(on) => onTuningChange(updateContent(tuning, sig.key, { enabled: on }))}
                ariaLabel={sig.hint}
              />
              <label className="feed-sorting-weight-input">
                {signal.enabled ? (
                  <>
                    <span className="feed-sorting-weight-label">×</span>
                    <input
                      type="number"
                      step="1"
                      value={signal.weight}
                      onChange={(e) => onTuningChange(updateContent(tuning, sig.key, { weight: parseInt(e.target.value) || 0 }))}
                    />
                  </>
                ) : null}
              </label>
            </div>
          )
        })}

        <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Engagement ratios</p>
        {RATIO_SIGNALS.map((sig) => {
          const signal = tuning.ratioSignals[sig.key]
          return (
            <div key={sig.key} className="feed-sorting-signal-row">
              <ToggleRow
                label={sig.label}
                hint={sig.hint}
                checked={signal.enabled}
                onChange={(on) => onTuningChange(updateRatio(tuning, sig.key, { enabled: on }))}
                ariaLabel={sig.hint}
              />
              <label className="feed-sorting-weight-input">
                {signal.enabled ? (
                  <>
                    <span className="feed-sorting-weight-label">×</span>
                    <input
                      type="number"
                      step="1"
                      value={signal.weight}
                      onChange={(e) => onTuningChange(updateRatio(tuning, sig.key, { weight: parseInt(e.target.value) || 0 }))}
                    />
                  </>
                ) : null}
              </label>
            </div>
          )
        })}
      </div>

      <FeedSortSharedSection tuning={tuning} onChange={onTuningChange} />

      <div className="feed-sorting-formula-display">
        <span className="feed-sorting-formula-label">Formula:</span>
        <code className="feed-sorting-formula">{formulaLabel}</code>
      </div>
    </div>
  )
}
