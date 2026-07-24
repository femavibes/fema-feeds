import { useEffect, useMemo, useState } from 'react'

import type { FeedConfig, EngagementWeights, SortTuning } from '@cfb/core-types'

import {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  DEFAULT_SORT_TUNING,
  SORT_MODE_OPTIONS,
  applySortMode,
  advancedFormulaLabel,
  detectEngagementWeights,
  detectSortMode,
  engagementFormulaLabel,
  rebuildSortRank,
  sortModeBadge,
  type SortMode,
} from '../../lib/feed-sorting'
import { FeedModePicker } from './FeedModePicker'
import { FeedSortingAdvancedPanel } from './FeedSortingAdvancedPanel'
import { FeedSortingChronologicalPanel } from './FeedSortingChronologicalPanel'
import { FeedSortingEngagementPanel } from './FeedSortingEngagementPanel'
import { SortFormulaBuilder } from './SortFormulaBuilder'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  layout?: 'main' | 'sidebar'
}

export function FeedSortingPanel({ draft, onChange, layout = 'sidebar' }: Props) {
  const detectedMode = useMemo(() => detectSortMode(draft.rank), [draft.rank])
  const [explicitMode, setExplicitMode] = useState<SortMode | null>(null)
  const mode = explicitMode ?? detectedMode
  const detectedWeights = useMemo(
    () => draft.rank?.sortKey ? detectEngagementWeights(draft.rank.sortKey) : DEFAULT_ENGAGEMENT_WEIGHTS,
    [draft.rank?.sortKey],
  )

  const [engagementWeights, setEngagementWeights] = useState<EngagementWeights>(detectedWeights)
  const [tuning, setTuning] = useState<SortTuning>(
    draft.rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...draft.rank.tuning } : DEFAULT_SORT_TUNING,
  )

  useEffect(() => {
    setEngagementWeights(detectedWeights)
  }, [draft.feedId, detectedWeights])

  useEffect(() => {
    setTuning(draft.rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...draft.rank.tuning } : DEFAULT_SORT_TUNING)
  }, [draft.feedId])

  const selectMode = (next: SortMode) => {
    setExplicitMode(next)
    if (next === 'builder') return
    if (next === 'advanced') {
      onChange((prev) => applySortMode(prev, 'advanced', engagementWeights, tuning))
      return
    }
    if (next === 'engagement') {
      onChange((prev) => applySortMode(prev, 'engagement', engagementWeights, tuning))
      return
    }
    onChange((prev) => applySortMode(prev, next, undefined, DEFAULT_SORT_TUNING))
  }

  const updateCompiledRank = (
    nextMode: 'engagement' | 'advanced',
    weights: EngagementWeights,
    nextTuning: SortTuning,
  ) => {
    onChange((prev) => rebuildSortRank(nextMode, weights, nextTuning, prev))
  }

  const updateWeights = (next: EngagementWeights) => {
    const anyEnabled = Object.values(next).some((s) => s.enabled)
    const safe = anyEnabled ? next : { ...next, likes: { ...next.likes, enabled: true } }
    setEngagementWeights(safe)
    if (mode === 'engagement') {
      updateCompiledRank('engagement', safe, tuning)
    } else if (mode === 'advanced') {
      updateCompiledRank('advanced', safe, tuning)
    }
  }

  const updateTuning = (next: SortTuning) => {
    setTuning(next)
    if (mode === 'engagement') {
      updateCompiledRank('engagement', engagementWeights, next)
    } else if (mode === 'advanced') {
      updateCompiledRank('advanced', engagementWeights, next)
    }
  }

  const isMain = layout === 'main'

  return (
    <div className={`feed-sorting-panel${isMain ? ' feed-sorting-panel-main' : ''}`}>
      {!isMain ? (
        <p className="card-hint feed-sorting-hint">
          Controls feed skeleton order — higher scores appear first. Autosaves to your draft; use{' '}
          <strong>Update</strong> to go live.
        </p>
      ) : null}

      <FeedModePicker
        options={SORT_MODE_OPTIONS}
        value={mode}
        onChange={(id) => selectMode(id as SortMode)}
        ariaLabel="Sort mode"
        className="feed-sorting-modes"
      />

      {mode === 'chronological' && (
        <FeedSortingChronologicalPanel draft={draft} onChange={onChange} />
      )}

      {mode === 'engagement' && (
        <FeedSortingEngagementPanel
          weights={engagementWeights}
          tuning={tuning}
          formulaLabel={engagementFormulaLabel(engagementWeights, tuning)}
          onWeightsChange={updateWeights}
          onTuningChange={updateTuning}
        />
      )}

      {mode === 'advanced' && (
        <FeedSortingAdvancedPanel
          weights={engagementWeights}
          tuning={tuning}
          formulaLabel={advancedFormulaLabel(engagementWeights, tuning)}
          onWeightsChange={updateWeights}
          onTuningChange={updateTuning}
        />
      )}

      {mode === 'builder' && (
        <div className="feed-sorting-tuning">
          <SortFormulaBuilder
            draft={draft}
            onChange={(expr) => onChange((prev) => ({
              ...prev,
              rank: { ...prev.rank, sortKey: expr, sortMode: 'builder' },
            }))}
          />
        </div>
      )}

      {!isMain ? (
        <div className="feed-sorting-status">
          <span className="badge badge-on">{sortModeBadge(mode, engagementWeights)}</span>
          <span className="card-hint feed-sorting-status-hint">
            {mode === 'chronological'
              ? (draft.rank?.chronologicalOrder === 'oldest'
                ? 'Oldest posts first by indexed time.'
                : 'Newest posts first by indexed time.')
              : 'Preview — click Use on this feed when ready.'}
          </span>
        </div>
      ) : null}
    </div>
  )
}
