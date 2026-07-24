import { useCallback, useEffect, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { FeedPersonalizationPanel } from './FeedPersonalizationPanel'
import { FeedPersonalizationOrchestrationSection } from './FeedPersonalizationOrchestrationSection'
import { SavePersonalizationModal } from './SavePersonalizationModal'
import { FeedSettingsApplyBar } from './FeedSettingsApplyBar'
import { RankerFeedSection } from '../plugins/RankerFeedSection'
import { PersonalizationFormulaFeedSection } from '../sort-packs/PersonalizationFormulaFeedSection'
import { personalizationSettingsApplied } from '../../lib/feed-settings-apply'
import { clearPersonalizationFormulaPackRef } from '../../lib/feed-personalization'

interface Props {
  draft: FeedConfig
  liveFeed: FeedConfig | null
  onApplySettings: (next: FeedConfig) => Promise<void>
  applyBusy?: boolean
}

export function FeedPersonalizationView({
  draft,
  liveFeed,
  onApplySettings,
  applyBusy = false,
}: Props) {
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const hasRankerRef = !!liveFeed?.rank?.rankerRef
  const hasFormulaPackRef = !!liveFeed?.personalization?.formulaPackRef
  const [source, setSource] = useState<FeedSourceMode>(
    hasRankerRef || hasFormulaPackRef ? 'subscribed' : 'native',
  )
  const [staging, setStaging] = useState(draft)
  const [syncRevision, setSyncRevision] = useState(0)

  useEffect(() => {
    setStaging(draft)
  }, [draft, syncRevision])

  const applied = personalizationSettingsApplied(staging, liveFeed)

  const handleApply = useCallback(async () => {
    const payload = staging.personalization?.formulaEnabled
      ? staging
      : clearPersonalizationFormulaPackRef(staging)
    await onApplySettings(payload)
    setSyncRevision((r) => r + 1)
  }, [onApplySettings, staging])

  const badge =
    source === 'subscribed'
      ? hasRankerRef
        ? 'Custom code'
        : hasFormulaPackRef
          ? 'Saved formula'
          : 'Library'
      : staging.personalization?.formulaEnabled
        ? 'Formula builder'
        : 'Presets'

  return (
    <div className="workspace-page feed-personalization-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Personalization</h2>
            <span className="badge badge-on">{badge}</span>
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
          Viewer-aware adjustments applied at serve time for <strong>{draft.name}</strong>.
          Personalization applies immediately on this feed — no <strong>Update Live</strong> needed.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <>
            <FeedPersonalizationPanel draft={staging} onChange={setStaging} />
            <FeedSettingsApplyBar
              applied={applied}
              busy={applyBusy}
              onApply={() => void handleApply()}
              hint="Preview presets or a formula, then apply when ready. Only one personalization source can be active."
            />
          </>
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section feed-formula-library-section">
            <PersonalizationFormulaFeedSection
              draft={staging}
              liveFeed={liveFeed}
              onApplySettings={onApplySettings}
              onStagingChange={setStaging}
              onFeedUpdated={() => setSyncRevision((r) => r + 1)}
              applyBusy={applyBusy}
              refreshKey={libraryRefreshKey}
            />
            <RankerFeedSection draft={staging} onChange={setStaging} />
            <FeedPersonalizationOrchestrationSection draft={staging} onChange={setStaging} />
            <FeedSettingsApplyBar
              applied={applied}
              busy={applyBusy}
              onApply={() => void handleApply()}
              hint="Feed layout changes (depth, author diversity) apply with the button above when editing orchestration."
            />
          </div>
        )}
      </section>

      <SavePersonalizationModal
        draft={staging}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSaved={() => setLibraryRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
