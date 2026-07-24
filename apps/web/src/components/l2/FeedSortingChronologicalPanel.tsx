import type { ChronologicalOrder, FeedConfig } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
}

export function FeedSortingChronologicalPanel({ draft, onChange }: Props) {
  return (
    <div className="feed-sorting-chronological">
      <p className="sidebar-block-title">Post time order</p>
      <div className="option-toggle-list" role="radiogroup" aria-label="Chronological order">
        <ToggleRow
          label="Newest first"
          hint="Most recently indexed posts appear first."
          checked={(draft.rank?.chronologicalOrder ?? 'newest') === 'newest'}
          onChange={(on) => {
            if (!on) return
            onChange((prev) => ({
              ...prev,
              rank: { ...prev.rank, chronologicalOrder: 'newest' satisfies ChronologicalOrder },
            }))
          }}
          ariaLabel="Newest first"
        />
        <ToggleRow
          label="Oldest first"
          hint="Earliest indexed posts appear first (reverse chronological)."
          checked={draft.rank?.chronologicalOrder === 'oldest'}
          onChange={(on) => {
            if (!on) return
            onChange((prev) => ({
              ...prev,
              rank: { ...prev.rank, chronologicalOrder: 'oldest' satisfies ChronologicalOrder },
            }))
          }}
          ariaLabel="Oldest first"
        />
      </div>
    </div>
  )
}
