import type { EngagementWeights, SortTuning } from '@cfb/core-types'
import {
  CONTENT_SIGNALS,
  ENGAGEMENT_SIGNALS,
  MEDIA_SIGNALS,
  RATIO_SIGNALS,
} from './feed-sorting-signals'
import { FeedSortSharedSection } from './FeedSortSharedSection'
import { FeedSortingSignalRows } from './FeedSortingSignalRows'
import { FeedSortingTuningSignalRows } from './FeedSortingTuningSignalRows'

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
  const mediaValues = Object.fromEntries(
    MEDIA_SIGNALS.map((s) => [s.key, tuning.mediaBonus[s.key]]),
  )
  const contentValues = Object.fromEntries(
    CONTENT_SIGNALS.map((s) => [s.key, tuning.contentSignals[s.key]]),
  )
  const ratioValues = Object.fromEntries(
    RATIO_SIGNALS.map((s) => [s.key, tuning.ratioSignals[s.key]]),
  )

  return (
    <div className="feed-sorting-tuning">
      <div className="feed-sorting-signal-grid">
        <section className="feed-sorting-signal-group">
          <p className="sidebar-block-title">Engagement signals</p>
          <FeedSortingSignalRows
            signals={ENGAGEMENT_SIGNALS}
            weights={weights}
            onChange={(key, signal) => onWeightsChange({ ...weights, [key]: signal })}
          />
        </section>

        <section className="feed-sorting-signal-group">
          <p className="sidebar-block-title">Media bonus</p>
          <FeedSortingTuningSignalRows
            signals={MEDIA_SIGNALS.map((s) => ({ ...s, hint: 'Flat bonus added to score when present' }))}
            values={mediaValues}
            weightPrefix="+"
            onChange={(key, patch) => onTuningChange(updateMedia(tuning, key as keyof SortTuning['mediaBonus'], patch))}
          />
        </section>

        <section className="feed-sorting-signal-group">
          <p className="sidebar-block-title">Content signals</p>
          <FeedSortingTuningSignalRows
            signals={CONTENT_SIGNALS}
            values={contentValues}
            onChange={(key, patch) => onTuningChange(updateContent(tuning, key as keyof SortTuning['contentSignals'], patch))}
          />
        </section>

        <section className="feed-sorting-signal-group">
          <p className="sidebar-block-title">Engagement ratios</p>
          <FeedSortingTuningSignalRows
            signals={RATIO_SIGNALS}
            values={ratioValues}
            onChange={(key, patch) => onTuningChange(updateRatio(tuning, key as keyof SortTuning['ratioSignals'], patch))}
          />
        </section>
      </div>

      <FeedSortSharedSection tuning={tuning} onChange={onTuningChange} />

      <div className="feed-sorting-formula-display">
        <span className="feed-sorting-formula-label">Formula:</span>
        <code className="feed-sorting-formula">{formulaLabel}</code>
      </div>
    </div>
  )
}
