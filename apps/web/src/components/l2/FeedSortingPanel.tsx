import { useEffect, useMemo, useState } from 'react'

import type { FeedConfig, L2Expr } from '@cfb/core-types'

import { ToggleSwitch } from '../ToggleSwitch'
import { SortPackFeedSection } from '../sort-packs/SortPackFeedSection'
import { InjectorFeedSection } from '../plugins/InjectorFeedSection'
import { RankerFeedSection } from '../plugins/RankerFeedSection'
import {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  DEFAULT_SORT_TUNING,
  SORT_MODE_OPTIONS,
  applySortMode,
  detectEngagementWeights,
  detectSortMode,
  engagementFormulaLabel,
  sortModeBadge,
  type EngagementWeights,
  type SortMode,
  type SortTuning,
} from '../../lib/feed-sorting'
import { L2_NUMERIC_FIELDS, fieldLabel } from '../../lib/l2-form'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  layout?: 'main' | 'sidebar'
}

const ENGAGEMENT_SIGNALS: {
  key: keyof EngagementWeights
  label: string
}[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'replies', label: 'Replies' },
  { key: 'quotes', label: 'Quotes' },
]

export function FeedSortingPanel({ draft, onChange, layout = 'sidebar' }: Props) {
  const detectedMode = useMemo(() => detectSortMode(draft.rank), [draft.rank])
  const detectedWeights = useMemo(
    () =>
      draft.rank?.sortKey
        ? detectEngagementWeights(draft.rank.sortKey)
        : DEFAULT_ENGAGEMENT_WEIGHTS,
    [draft.rank?.sortKey],
  )

  const [engagementWeights, setEngagementWeights] = useState<EngagementWeights>(detectedWeights)
  const [tuning, setTuning] = useState<SortTuning>(DEFAULT_SORT_TUNING)

  useEffect(() => {
    setEngagementWeights(detectedWeights)
  }, [draft.feedId, detectedWeights])

  const mode = detectedMode
  const usingPack = mode === 'pack'

  const selectMode = (next: SortMode) => {
    if (next === 'engagement') {
      onChange(applySortMode(draft, next, engagementWeights, DEFAULT_SORT_TUNING))
      return
    }
    if (next === 'custom') {
      // Default custom expr that won't be detected as engagement
      const customDefault: L2Expr = { type: 'field', field: 'editor_score' }
      onChange({ ...draft, rank: { sortKey: customDefault } })
      return
    }
    onChange(applySortMode(draft, next, undefined, DEFAULT_SORT_TUNING))
  }

  const updateWeights = (next: EngagementWeights) => {
    // Ensure at least one signal is enabled
    const anyEnabled = next.likes.enabled || next.reposts.enabled || next.replies.enabled || next.quotes.enabled
    const safe = anyEnabled ? next : { ...next, likes: { ...next.likes, enabled: true } }
    setEngagementWeights(safe)
    onChange(applySortMode(draft, 'engagement', safe, tuning))
  }

  const updateTuning = (next: SortTuning) => {
    setTuning(next)
    if (mode === 'engagement') {
      onChange(applySortMode(draft, 'engagement', engagementWeights, next))
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

      <div className="feed-sorting-modes" role="radiogroup" aria-label="Sort mode">
        {SORT_MODE_OPTIONS.map((opt) => (
          <label key={opt.id} className={`feed-sorting-mode-option${mode === opt.id ? ' active' : ''}`}>
            <input
              type="radio"
              name="sort-mode"
              value={opt.id}
              checked={mode === opt.id}
              onChange={() => selectMode(opt.id)}
            />
            <span className="feed-sorting-mode-label">{opt.label}</span>
            <span className="feed-sorting-mode-hint">{opt.hint}</span>
          </label>
        ))}
      </div>

      {mode === 'engagement' && (
        <div className="feed-sorting-tuning">
          <p className="sidebar-block-title">Signals & weights</p>
          <div className="feed-sorting-signals">
            {ENGAGEMENT_SIGNALS.map((sig) => {
              const signal = engagementWeights[sig.key]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleSwitch
                    checked={signal.enabled}
                    onChange={(on) =>
                      updateWeights({
                        ...engagementWeights,
                        [sig.key]: { ...signal, enabled: on },
                      })
                    }
                    ariaLabel={`Include ${sig.label.toLowerCase()}`}
                  />
                  <span className="feed-sorting-signal-label">{sig.label}</span>
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">×</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = Math.max(1, parseInt(e.target.value) || 1)
                            updateWeights({
                              ...engagementWeights,
                              [sig.key]: { ...signal, weight: w },
                            })
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}
          </div>

          <div className="feed-sorting-formula-display">
            <span className="feed-sorting-formula-label">Formula:</span>
            <code className="feed-sorting-formula">{engagementFormulaLabel(engagementWeights, tuning)}</code>
          </div>

          <div className="feed-sorting-tuning-fields">
            <label className="l2-inspector-field">
              Time decay (half-life hours)
              <input
                type="number"
                min="0"
                step="1"
                value={tuning.decayHalfLifeHours}
                onChange={(e) => updateTuning({ ...tuning, decayHalfLifeHours: Math.max(0, parseInt(e.target.value) || 0) })}
              />
              <span className="card-hint">0 = no decay. Posts lose half their score every N hours.</span>
            </label>
            <label className="l2-inspector-field">
              Editor score boost
              <input
                type="number"
                min="0"
                step="100"
                value={tuning.editorScoreWeight}
                onChange={(e) => updateTuning({ ...tuning, editorScoreWeight: Math.max(0, parseInt(e.target.value) || 0) })}
              />
              <span className="card-hint">0 = ignore. Multiplies editor_score from Score nodes before adding.</span>
            </label>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="feed-sorting-tuning">
          <p className="sidebar-block-title">Custom formula</p>
          <p className="card-hint">Raw L2Expr JSON — a visual builder is coming soon.</p>
          <textarea
            className="feed-sorting-custom-expr"
            rows={6}
            value={JSON.stringify(draft.rank?.sortKey ?? { type: 'field', field: 'like_count' }, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value) as L2Expr
                if (parsed.type) {
                  onChange({ ...draft, rank: { sortKey: parsed } })
                }
              } catch { /* ignore parse errors while typing */ }
            }}
          />
          <p className="card-hint">Available fields: {L2_NUMERIC_FIELDS.map(f => fieldLabel(f)).join(', ')}</p>
        </div>
      )}

      {!isMain ? (
        <div className="feed-sorting-status">
          <span className="badge badge-on">{sortModeBadge(mode, engagementWeights)}</span>
          <span className="card-hint feed-sorting-status-hint">
            {usingPack
              ? 'Sort pack resolved at eval — Update live to rebuild candidates.'
              : mode === 'chronological'
                ? 'Matches post indexed time when candidates are built.'
                : 'Formula applied when candidates are rebuilt after Update live.'}
          </span>
        </div>
      ) : null}

      <SortPackFeedSection draft={draft} onChange={onChange} />
      <RankerFeedSection draft={draft} onChange={onChange} />
      <InjectorFeedSection draft={draft} onChange={onChange} />
    </div>
  )
}
