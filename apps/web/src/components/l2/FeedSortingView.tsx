import { useCallback, useEffect, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { FeedSortingPanel } from './FeedSortingPanel'
import { SortPackFeedSection } from '../sort-packs/SortPackFeedSection'
import { SaveSortPackModal } from '../sort-packs/SaveSortPackModal'
import { FeedSettingsApplyBar } from './FeedSettingsApplyBar'
import { detectSortMode, sortModeBadge, DEFAULT_ENGAGEMENT_WEIGHTS, detectEngagementWeights } from '../../lib/feed-sorting'
import { sortingSettingsApplied } from '../../lib/feed-settings-apply'

interface Props {
  draft: FeedConfig
  liveFeed: FeedConfig | null
  onApplySettings: (next: FeedConfig) => Promise<void>
  applyBusy?: boolean
}

export function FeedSortingView({
  draft,
  liveFeed,
  onApplySettings,
  applyBusy = false,
}: Props) {
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const hasPackRef = !!liveFeed?.rank?.packRef
  const [source, setSource] = useState<FeedSourceMode>(hasPackRef ? 'subscribed' : 'native')
  const [staging, setStaging] = useState(draft)
  const [syncRevision, setSyncRevision] = useState(0)

  useEffect(() => {
    setStaging(draft)
  }, [draft, syncRevision])

  const mode = detectSortMode(liveFeed?.rank ?? staging.rank)
  const weights = liveFeed?.rank?.sortKey
    ? detectEngagementWeights(liveFeed.rank.sortKey)
    : staging.rank?.sortKey
      ? detectEngagementWeights(staging.rank.sortKey)
      : DEFAULT_ENGAGEMENT_WEIGHTS

  const applied = sortingSettingsApplied(staging, liveFeed)

  const handleApply = useCallback(async () => {
    await onApplySettings(staging)
    setSyncRevision((r) => r + 1)
  }, [onApplySettings, staging])

  return (
    <div className="workspace-page feed-sorting-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Sorting</h2>
            <span className="badge badge-on">{sortModeBadge(mode, weights)}</span>
          </div>
          <div className="workspace-context-head-controls">
            <FeedSourceToggle
              value={source}
              onChange={setSource}
              nativeLabel="Create"
              subscribedLabel="My collection & subscribed"
            />
            {source === 'native' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSaveModalOpen(true)}
              >
                Save to collection
              </button>
            )}
          </div>
        </div>
        <p className="card-hint">
          How posts are ordered in <strong>{draft.name}</strong> when the feed skeleton is built.
          Use <strong>Update Live</strong> in the sidebar only when match rules change — sorting applies below without a full rebuild.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <>
            <FeedSortingPanel draft={staging} onChange={setStaging} layout="main" />
            <FeedSettingsApplyBar
              applied={applied}
              busy={applyBusy}
              onApply={() => void handleApply()}
              rescoreNote
              hint="Preview your sort mode and weights, then apply when ready. Only one sort source can be active on this feed."
            />
          </>
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section">
            <SortPackFeedSection
              draft={staging}
              liveFeed={liveFeed}
              onApplySettings={onApplySettings}
              onStagingChange={setStaging}
              onFeedUpdated={() => setSyncRevision((r) => r + 1)}
              applyBusy={applyBusy}
              refreshKey={libraryRefreshKey}
            />
          </div>
        )}
      </section>

      <SaveSortPackModal
        draft={staging}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSaved={() => setLibraryRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
