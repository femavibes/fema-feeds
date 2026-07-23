import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackPackage, SortPackRef } from '@cfb/core-types'

import { api } from '../../api/client'
import {
  applySortPack,
  hasSortPackRef,
} from '../../lib/feed-sorting'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  onPackExprResolved?: (expr: L2Expr | null) => void
  refreshKey?: number
}

function SortPackList({
  items,
  packRef,
  onApply,
}: {
  items: SortPackPackage[]
  packRef?: SortPackRef
  onApply: (pkg: SortPackPackage) => void
}) {
  if (items.length === 0) return null
  return (
    <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
      {items.map((pkg) => (
        <li key={pkg.id}>
          <button
            type="button"
            className={`logic-blocks-catalog-item${packRef?.packageId === pkg.id ? ' logic-blocks-catalog-item-active' : ''}`}
            onClick={() => onApply(pkg)}
          >
            <span className="logic-blocks-catalog-name">{pkg.name}</span>
            <span className="logic-blocks-catalog-sub">v{pkg.version}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function SortPackFeedSection({
  draft,
  onChange,
  onPackExprResolved,
  refreshKey = 0,
}: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [collection, setCollection] = useState<SortPackPackage[]>([])
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null)

  const packRef = draft.rank?.packRef
  const usingPack = hasSortPackRef(draft.rank)
  const sortingSubscriptions = useMemo(
    () => subscriptions.filter((sub) => (sub.package.packKind ?? 'sort') === 'sort'),
    [subscriptions],
  )

  useEffect(() => {
    void Promise.all([api.listSortPackSubscriptions(), api.listSortPackCollection('sort')])
      .then(([subsRes, collectionRes]) => {
        setSubscriptions(subsRes.subscriptions)
        setCollection(collectionRes.packages)
      })
      .catch(() => {
        setSubscriptions([])
        setCollection([])
      })
  }, [refreshKey])

  useEffect(() => {
    if (!onPackExprResolved) return
    if (!packRef?.packageId) {
      onPackExprResolved(null)
      return
    }
    const match = sortingSubscriptions.find((s) => s.packageId === packRef.packageId)
    const collectionMatch = collection.find((p) => p.id === packRef.packageId)
    onPackExprResolved(match?.package?.sortKey ?? collectionMatch?.sortKey ?? null)
  }, [packRef?.packageId, sortingSubscriptions, collection, onPackExprResolved])

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

  const subscribedPackages = useMemo(
    () =>
      [...sortingSubscriptions]
        .map((s) => s.package)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [sortingSubscriptions],
  )

  const collectionPackages = useMemo(
    () => [...collection].sort((a, b) => a.name.localeCompare(b.name)),
    [collection],
  )

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

  const hasAny = collectionPackages.length > 0 || subscribedPackages.length > 0

  return (
    <div className="feed-sorting-packs">
      <p className="sidebar-block-title">Native sorting formulas</p>
      {usingPack && packRef ? (
        <p className="card-hint">
          Using <strong>{packRef.label ?? 'sort pack'}</strong> v{packRef.versionPin}
          {packRef.updatePolicy ? ` (${packRef.updatePolicy})` : ''}. Pick another formula below or switch to
          Create to edit inline.
        </p>
      ) : (
        <p className="card-hint">
          Apply a formula from My collection or a marketplace subscription. Switch to Create to build a new sort
          from scratch.
        </p>
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

      {collectionPackages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">My collection</p>
          <SortPackList items={collectionPackages} packRef={packRef} onApply={applyPack} />
        </>
      ) : null}

      {subscribedPackages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">Subscribed</p>
          <SortPackList items={subscribedPackages} packRef={packRef} onApply={applyPack} />
        </>
      ) : null}

      {!hasAny ? (
        <p className="card-hint">
          Nothing saved yet. On <strong>Create</strong>, configure a sort and use <strong>Save to collection</strong>,
          or subscribe in Marketplace → Sorting formulas.
        </p>
      ) : null}
    </div>
  )
}
