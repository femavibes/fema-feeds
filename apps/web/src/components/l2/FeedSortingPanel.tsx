import { useEffect, useMemo, useState } from 'react'

import type { FeedConfig, L2Expr } from '@cfb/core-types'

import { ToggleRow } from '../ToggleRow'
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

const ENGAGEMENT_TUNING: {
  key: keyof EngagementWeights
  label: string
  hint: string
}[] = [
  { key: 'likes', label: 'Likes', hint: 'Include like count in the score' },
  { key: 'reposts', label: 'Reposts', hint: 'Include repost count in the score' },
  { key: 'replies', label: 'Replies', hint: 'Include reply count in the score' },
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
  const [showTuning, setShowTuning] = useState(false)

  useEffect(() => {
    setEngagementWeights(detectedWeights)
  }, [draft.feedId, detectedWeights])

  const mode = detectedMode
  const weights =
    mode === 'engagement' ? engagementWeights : detectedWeights
  const usingPack = mode === 'pack'

  const selectMode = (next: SortMode) => {
    if (next === 'engagement') {
      onChange(applySortMode(draft, next, engagementWeights, tuning))
      return
    }
    if (next === 'custom') {
      // Enter custom mode — keep current sortKey or set a default
      if (!draft.rank?.sortKey) {
        onChange({ ...draft, rank: { sortKey: { type: 'field', field: 'like_count' } } })
      }
      return
    }
    onChange(applySortMode(draft, next, undefined, tuning))
  }

  const updateEngagementWeights = (next: EngagementWeights) => {
    const withFallback =
      !next.likes && !next.reposts && !next.replies
        ? { ...next, likes: true }
        : next
    setEngagementWeights(withFallback)
    onChange(applySortMode(draft, 'engagement', withFallback, tuning))
  }

  const updateTuning = (next: SortTuning) => {
    setTuning(next)
    if (mode !== 'chronological' && mode !== 'pack' && mode !== 'custom') {
      onChange(applySortMode(draft, mode, engagementWeights, next))
    }
  }

  const isMain = layout === 'main'

  return (
    <div className={`feed-sorting-panel${isMain ? ' feed-sorting-panel-main' : ''}`}>
      {!isMain ? (
        <p className="card-hint feed-sorting-hint">
          Controls feed skeleton order — higher scores appear first. Autosaves to your draft; use{' '}
          <strong>Update</strong> to go live. Personalization and FYP-style ranking coming later.
        </p>
      ) : null}

      <div className="option-toggle-list feed-sorting-modes" role="radiogroup" aria-label="Sort mode">
        {SORT_MODE_OPTIONS.map((opt) => (
          <ToggleRow
            key={opt.id}
            label={opt.label}
            hint={opt.hint}
            checked={mode === opt.id}
            onChange={(on) => {
              if (on) {
                selectMode(opt.id)
              } else if (mode === opt.id) {
                selectMode('chronological')
              }
            }}
            ariaLabel={`Sort by ${opt.label}`}
          />
        ))}
      </div>

      {mode === 'engagement' && (
        <div className="feed-sorting-tuning">
          <p className="sidebar-block-title">Tune engagement</p>
          <div className="option-toggle-list" role="group" aria-label="Engagement signals">
            {ENGAGEMENT_TUNING.map((opt) => (
              <ToggleRow
                key={opt.key}
                label={opt.label}
                hint={opt.hint}
                checked={engagementWeights[opt.key]}
                onChange={(on) =>
                  updateEngagementWeights({ ...engagementWeights, [opt.key]: on })
                }
                ariaLabel={`Include ${opt.label.toLowerCase()} in engagement score`}
              />
            ))}
          </div>
        </div>
      )}

      {mode !== 'chronological' && mode !== 'pack' && mode !== 'custom' && (
        <div className="feed-sorting-tuning">
          <button
            type="button"
            className="btn btn-ghost btn-sm feed-sorting-tuning-toggle"
            onClick={() => setShowTuning((v) => !v)}
          >
            {showTuning ? '▾ Advanced tuning' : '▸ Advanced tuning'}
          </button>
          {showTuning && (
            <div className="feed-sorting-advanced-tuning">
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
                <span className="card-hint">0 = ignore. Multiplies editor_score from Score nodes before adding to engagement.</span>
              </label>
            </div>
          )}
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
          <span className="badge badge-on">{sortModeBadge(mode, weights)}</span>
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
