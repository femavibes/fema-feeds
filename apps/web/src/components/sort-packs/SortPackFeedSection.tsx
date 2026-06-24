import { useEffect, useState } from 'react'
import type { FeedConfig, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import {
  applySortPack,
  detectSortMode,
  hasSortPackRef,
  rankExprForMode,
  type EngagementWeights,
} from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

export function SortPackFeedSection({ draft, onChange }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null)

  const packRef = draft.rank?.packRef
  const usingPack = hasSortPackRef(draft.rank)

  useEffect(() => {
    void api.listSortPackSubscriptions().then((res) => setSubscriptions(res.subscriptions)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!draft.feedId) return
    void api
      .getFeedSortPackUpgrade(draft.feedId)
      .then((res) => {
        const u = res.upgrade
        if (!u) {
          setUpgradeHint(null)
          return
        }
        setUpgradeHint(`Sort pack “${u.packageName}” has v${u.latestVersion} (pinned v${u.pinnedVersion}).`)
      })
      .catch(() => setUpgradeHint(null))
  }, [draft.feedId, packRef?.versionPin])

  const applyPack = (pkg: SortPackPackage) => {
    onChange(applySortPack(draft, pkg, 'pinned'))
  }

  const saveCurrentSort = async () => {
    const mode = detectSortMode(draft.rank)
    const weights: EngagementWeights = { likes: true, reposts: true, replies: false }
    const sortKey = draft.rank?.sortKey ?? rankExprForMode(mode, weights)
    if (!sortKey) {
      setSaveError('Choose a non-chronological sort first.')
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      await api.createSortPack({
        name: saveName.trim() || 'Custom sort',
        sortKey,
        visibility: 'collection',
      })
      setSaveOpen(false)
      setSaveName('')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaveBusy(false)
    }
  }

  const applyUpgrade = async () => {
    if (!draft.feedId) return
    setUpgradeBusy(true)
    try {
      const res = await api.applyFeedSortPackUpgrade(draft.feedId)
      onChange(res.feed)
      setUpgradeHint(null)
    } finally {
      setUpgradeBusy(false)
    }
  }

  return (
    <div className="feed-sorting-packs">
      <p className="sidebar-block-title">Pool sort — marketplace packs</p>
      {usingPack && packRef ? (
        <p className="card-hint">
          Using <strong>{packRef.label ?? 'sort pack'}</strong> v{packRef.versionPin}
          {packRef.updatePolicy ? ` (${packRef.updatePolicy})` : ''}.
        </p>
      ) : (
        <p className="card-hint">Apply a subscribed sort pack, or save your current formula to My collection.</p>
      )}

      {upgradeHint ? (
        <div className="feed-sorting-upgrade">
          <p className="settings-hint">{upgradeHint}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={upgradeBusy}
            onClick={() => void applyUpgrade()}
          >
            {upgradeBusy ? 'Updating…' : 'Upgrade sort pack'}
          </button>
        </div>
      ) : null}

      {subscriptions.length > 0 ? (
        <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
          {subscriptions.map((sub) => (
            <li key={sub.packageId}>
              <button
                type="button"
                className="logic-blocks-catalog-item"
                onClick={() => applyPack(sub.package)}
              >
                <span className="logic-blocks-catalog-name">{sub.package.name}</span>
                <span className="logic-blocks-catalog-sub">v{sub.versionPin}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-hint">Subscribe to sort packs in Marketplace → Browse.</p>
      )}

      {!saveOpen ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSaveOpen(true)}>
          Save sort to collection
        </button>
      ) : (
        <div className="feed-sorting-save-pack">
          <label className="field-label">
            Name
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Discussion-heavy sort"
            />
          </label>
          {saveError ? <p className="field-error">{saveError}</p> : null}
          <div className="feed-sorting-save-pack-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saveBusy}
              onClick={() => void saveCurrentSort()}
            >
              {saveBusy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
