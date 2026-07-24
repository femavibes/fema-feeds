import type { EngagementWeights, SortTuning } from '@cfb/core-types'
import { ENGAGEMENT_SIGNALS } from './feed-sorting-signals'
import { FeedSortSharedSection } from './FeedSortSharedSection'
import { FeedSortingSignalRows } from './FeedSortingSignalRows'

interface Props {
  weights: EngagementWeights
  tuning: SortTuning
  formulaLabel: string
  onWeightsChange: (next: EngagementWeights) => void
  onTuningChange: (next: SortTuning) => void
}

export function FeedSortingEngagementPanel({
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
      </div>

      <FeedSortSharedSection tuning={tuning} onChange={onTuningChange} />

      <div className="feed-sorting-formula-display">
        <span className="feed-sorting-formula-label">Formula:</span>
        <code className="feed-sorting-formula">{formulaLabel}</code>
      </div>
    </div>
  )
}
