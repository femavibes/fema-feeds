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
  hasSortPackRef,
  rebuildSortRank,
  sortModeBadge,
  type SortMode,
} from '../../lib/feed-sorting'
import { FeedModePicker } from './FeedModePicker'
import { FeedSortingAdvancedPanel } from './FeedSortingAdvancedPanel'
import { FeedSortingChronologicalPanel } from './FeedSortingChronologicalPanel'
import { FeedSortingEngagementPanel } from './FeedSortingEngagementPanel'
import { SortFormulaBuilder } from './SortFormulaBuilder'
import { FeedSettingsApplyBar } from './FeedSettingsApplyBar'
import { FormulaFieldReference } from './FormulaFieldReference'
import { SORT_FORMULA_FIELD_LEGEND } from './formula-field-legend-data'

interface ApplyBarProps {
  applied: boolean
  busy?: boolean
  onApply: () => void
  rescoreNote?: boolean
}

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  layout?: 'main' | 'sidebar'
  applyBar?: ApplyBarProps
  /** Lock mode picker to this mode (collection edit). */
  initialMode?: SortMode
}

const CREATE_SORT_MODES = SORT_MODE_OPTIONS.map((o) => o.id as SortMode)
const DEFAULT_CREATE_SORT_MODE: SortMode = 'chronological'

function resolveCreateSortMode(rank: FeedConfig['rank'], explicit: SortMode | null): SortMode {
  if (explicit && CREATE_SORT_MODES.includes(explicit)) return explicit
  const detected = detectSortMode(rank)
  if (CREATE_SORT_MODES.includes(detected)) return detected
  return DEFAULT_CREATE_SORT_MODE
}

export function FeedSortingPanel({ draft, onChange, layout = 'sidebar', applyBar, initialMode }: Props) {
  const isMain = layout === 'main'
  const detectedMode = useMemo(() => detectSortMode(draft.rank), [draft.rank])
  const [explicitMode, setExplicitMode] = useState<SortMode | null>(initialMode ?? null)
  const mode = isMain
    ? resolveCreateSortMode(draft.rank, explicitMode)
    : (explicitMode ?? detectedMode)
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

  useEffect(() => {
    if (initialMode) setExplicitMode(initialMode)
  }, [initialMode, draft.feedId])

  // Keep rank.sortMode aligned with the visible engagement/advanced tab so saves reopen correctly.
  useEffect(() => {
    if (mode !== 'engagement' && mode !== 'advanced') return
    if (draft.rank?.sortMode === mode) return
    onChange((prev) => ({
      ...prev,
      rank: {
        ...prev.rank,
        sortKey: prev.rank?.sortKey,
        tuning: prev.rank?.tuning ?? tuning,
        sortMode: mode,
      },
    }))
  }, [mode, draft.rank?.sortMode, tuning])

  // Create tab: a subscribed sort pack isn't a Create toggle — seed first mode as preview only.
  useEffect(() => {
    if (!isMain || !applyBar) return
    if (!hasSortPackRef(draft.rank)) return
    setExplicitMode(DEFAULT_CREATE_SORT_MODE)
    onChange((prev) => applySortMode(prev, DEFAULT_CREATE_SORT_MODE, DEFAULT_ENGAGEMENT_WEIGHTS, DEFAULT_SORT_TUNING))
  }, [isMain, draft.feedId, draft.rank?.packRef?.packageId])

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

      {isMain && applyBar ? (
        <>
          <hr className="feed-sort-section-divider feed-settings-apply-top-divider" />
          <FeedSettingsApplyBar
            {...applyBar}
            layout="toolbar"
            trailing={
              mode === 'builder' ? (
                <FormulaFieldReference
                  entries={SORT_FORMULA_FIELD_LEGEND}
                  toggleLabel="Signal reference"
                  hideLabel="Hide signal reference"
                  hideHint
                  compact
                />
              ) : null
            }
          />
          <hr className="feed-sort-section-divider feed-settings-apply-divider" />
        </>
      ) : null}

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
            hideFieldReference={isMain && !!applyBar}
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
