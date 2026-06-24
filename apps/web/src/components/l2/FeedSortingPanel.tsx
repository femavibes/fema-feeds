import { useEffect, useMemo, useState } from 'react'

import type { FeedConfig } from '@cfb/core-types'

import { ToggleRow } from '../ToggleRow'
import { SortPackFeedSection } from '../sort-packs/SortPackFeedSection'
import { InjectorFeedSection } from '../plugins/InjectorFeedSection'
import { RankerFeedSection } from '../plugins/RankerFeedSection'
import {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  SORT_MODE_OPTIONS,
  applySortMode,
  detectEngagementWeights,
  detectSortMode,
  sortModeBadge,
  type EngagementWeights,
  type SortMode,
} from '../../lib/feed-sorting'

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

  useEffect(() => {
    setEngagementWeights(detectedWeights)
  }, [draft.feedId, detectedWeights])

  const mode = detectedMode
  const weights =
    mode === 'engagement' ? engagementWeights : detectedWeights
  const usingPack = mode === 'pack'

  const selectMode = (next: SortMode) => {
    if (next === 'engagement') {
      onChange(applySortMode(draft, next, engagementWeights))
      return
    }
    onChange(applySortMode(draft, next))
  }

  const updateEngagementWeights = (next: EngagementWeights) => {
    const withFallback =
      !next.likes && !next.reposts && !next.replies
        ? { ...next, likes: true }
        : next
    setEngagementWeights(withFallback)
    onChange(applySortMode(draft, 'engagement', withFallback))
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
