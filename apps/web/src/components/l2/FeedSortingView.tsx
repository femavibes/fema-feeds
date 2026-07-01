import { useState } from 'react'
import type { FeedConfig, L2Expr } from '@cfb/core-types'
import { FeedSourceToggle, type FeedSourceMode } from '../FeedSourceToggle'
import { FeedSortingPanel } from './FeedSortingPanel'
import { SortPackFeedSection } from '../sort-packs/SortPackFeedSection'
import { SaveSortPackModal } from '../sort-packs/SaveSortPackModal'
import { exprToFormula } from '../../lib/formula-parser'
import { detectSortMode, sortModeBadge, DEFAULT_ENGAGEMENT_WEIGHTS, detectEngagementWeights, type EngagementWeights } from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  settingsDirty: boolean
  settingsAutosaveState: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  settingsSaving: boolean
  onSaveSettings: () => void
}

function autosaveLabel(state: Props['settingsAutosaveState']): string | null {
  if (state === 'pending' || state === 'saving') return 'Autosaving…'
  if (state === 'saved') return 'Saved to draft'
  if (state === 'error') return 'Autosave failed — save manually'
  return 'Unsaved — autosaving'
}

const SIGNAL_LABELS: { key: keyof EngagementWeights; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'replies', label: 'Replies' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookmarks', label: 'Bookmarks' },
]

export function FeedSortingView({
  draft,
  onChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
}: Props) {
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const hasPackRef = !!draft.rank?.packRef
  const [source, setSource] = useState<FeedSourceMode>(hasPackRef ? 'subscribed' : 'native')
  const [packExpr, setPackExpr] = useState<L2Expr | null>(null)
  const [copied, setCopied] = useState(false)
  const mode = detectSortMode(draft.rank)
  const weights = draft.rank?.sortKey
    ? detectEngagementWeights(draft.rank.sortKey)
    : DEFAULT_ENGAGEMENT_WEIGHTS

  const packWeights = packExpr ? detectEngagementWeights(packExpr) : null

  const copyExpr = () => {
    if (!packExpr) return
    void navigator.clipboard.writeText(JSON.stringify(packExpr, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="workspace-page feed-sorting-view">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row workspace-context-head-row-split">
          <div>
            <h2>Sorting</h2>
            <span className="badge badge-on">{sortModeBadge(mode, weights)}</span>
          </div>
          <div className="workspace-context-head-controls">
            <FeedSourceToggle value={source} onChange={setSource} />
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
          Use <strong>Update</strong> in the right sidebar to rebuild candidates with a new order.
        </p>
      </header>

      <section className="card feed-sorting-view-panel">
        {source === 'native' && (
          <FeedSortingPanel draft={draft} onChange={onChange} layout="main" />
        )}
        {source === 'subscribed' && (
          <div className="feed-subscribed-section">
            <SortPackFeedSection draft={draft} onChange={onChange} onPackExprResolved={setPackExpr} />

            {/* Read-only formula breakdown for native sort packs */}
            {packExpr && (
              <div className="feed-subscribed-readonly">
                <p className="sidebar-block-title">Formula (read-only)</p>
                <div className="feed-sorting-formula-display">
                  <code className="feed-sorting-formula">{exprToFormula(packExpr)}</code>
                </div>

                {packWeights && (
                  <div className="feed-subscribed-weights">
                    <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Engagement signals</p>
                    <div className="feed-subscribed-signals-grid">
                      {SIGNAL_LABELS.map(({ key, label }) => {
                        const sig = packWeights[key]
                        return (
                          <div key={key} className="feed-subscribed-signal-row">
                            <span className={`feed-subscribed-signal-indicator${sig.enabled ? ' is-on' : ''}`} />
                            <span className={`feed-subscribed-signal-label${sig.enabled ? '' : ' is-off'}`}>{label}</span>
                            <span className={`feed-subscribed-signal-weight${sig.enabled ? '' : ' is-off'}`}>
                              {sig.enabled ? `×${sig.weight}` : 'off'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="feed-sorting-custom-section" style={{ marginTop: '0.75rem' }}>
                  <div className="feed-sorting-custom-header">
                    <p className="sidebar-block-title">Raw expression</p>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={copyExpr}>
                      {copied ? 'Copied!' : 'Copy JSON'}
                    </button>
                  </div>
                  <textarea
                    className="feed-sorting-custom-expr"
                    rows={6}
                    value={JSON.stringify(packExpr, null, 2)}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {settingsDirty ? (
        <div className="workspace-save-status">
          <span className="badge badge-warn">Unsaved</span>
          <span className="card-hint">{autosaveLabel(settingsAutosaveState)}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={settingsSaving}
            onClick={onSaveSettings}
          >
            {settingsSaving ? 'Saving…' : 'Save now'}
          </button>
        </div>
      ) : null}

      <SaveSortPackModal draft={draft} open={saveModalOpen} onClose={() => setSaveModalOpen(false)} />
    </div>
  )
}
