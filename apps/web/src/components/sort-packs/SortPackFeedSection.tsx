import { useEffect, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import {
  applySortPack,
  hasSortPackRef,
} from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  onPackExprResolved?: (expr: L2Expr | null) => void
}

export function SortPackFeedSection({ draft, onChange, onPackExprResolved }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null)

  const packRef = draft.rank?.packRef
  const usingPack = hasSortPackRef(draft.rank)

  useEffect(() => {
    void api.listSortPackSubscriptions().then((res) => setSubscriptions(res.subscriptions)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!onPackExprResolved) return
    if (!packRef?.packageId) {
      onPackExprResolved(null)
      return
    }
    const match = subscriptions.find((s) => s.packageId === packRef.packageId)
    onPackExprResolved(match?.package?.sortKey ?? null)
  }, [packRef?.packageId, subscriptions, onPackExprResolved])

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
                className={`logic-blocks-catalog-item${packRef?.packageId === sub.packageId ? ' logic-blocks-catalog-item-active' : ''}`}
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
    </div>
  )
}
