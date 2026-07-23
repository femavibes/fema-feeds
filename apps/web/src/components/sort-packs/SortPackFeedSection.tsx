import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { useCurrentUserDid } from '../../hooks/useCurrentUserDid'
import { excludeOwnFromSubscribed } from '../../lib/feed-subscriptions'
import {
  applySortPack,
  hasSortPackRef,
} from '../../lib/feed-sorting'
import { FeedFormulaPackGrid } from './FeedFormulaPackGrid'
import { FeedFormulaPreviewPanel } from '../l2/FeedFormulaPreviewPanel'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  onPackExprResolved?: (expr: L2Expr | null) => void
  refreshKey?: number
}

export function SortPackFeedSection({
  draft,
  onChange,
  onPackExprResolved,
  refreshKey = 0,
}: Props) {
  const userDid = useCurrentUserDid()
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [collection, setCollection] = useState<SortPackPackage[]>([])
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeHint, setUpgradeHint] = useState<string | null>(null)

  const packRef = draft.rank?.packRef
  const appliedPackageId = packRef?.packageId ?? null
  const usingPack = hasSortPackRef(draft.rank)
  const [previewPackageId, setPreviewPackageId] = useState<string | null>(appliedPackageId)

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
    setPreviewPackageId(appliedPackageId)
  }, [appliedPackageId, refreshKey])

  const subscribedPackages = useMemo(
    () =>
      excludeOwnFromSubscribed(
        [...sortingSubscriptions]
          .map((s) => s.package)
          .sort((a, b) => a.name.localeCompare(b.name)),
        { userDid, collectionPackageIds: collection.map((p) => p.id) },
      ),
    [sortingSubscriptions, userDid, collection],
  )

  const collectionPackages = useMemo(
    () => [...collection].sort((a, b) => a.name.localeCompare(b.name)),
    [collection],
  )

  const allPackages = useMemo(
    () => [...collectionPackages, ...subscribedPackages],
    [collectionPackages, subscribedPackages],
  )

  const previewPackage = useMemo(
    () => allPackages.find((pkg) => pkg.id === previewPackageId) ?? null,
    [allPackages, previewPackageId],
  )

  useEffect(() => {
    if (!onPackExprResolved) return
    onPackExprResolved(previewPackage?.sortKey ?? null)
  }, [previewPackage, onPackExprResolved])

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

  const hasAny = collectionPackages.length > 0 || subscribedPackages.length > 0
  const previewIsApplied = previewPackageId != null && previewPackageId === appliedPackageId

  return (
    <div className="feed-sorting-packs">
      <p className="sidebar-block-title">Native sorting formulas</p>
      {usingPack && packRef ? (
        <p className="card-hint">
          Using <strong>{packRef.label ?? 'sort pack'}</strong> v{packRef.versionPin}
          {packRef.updatePolicy ? ` (${packRef.updatePolicy})` : ''}. Preview others below, then apply when ready.
        </p>
      ) : (
        <p className="card-hint">
          Preview a formula from My collection or a marketplace subscription. Apply only when you want it on this feed.
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
          <FeedFormulaPackGrid
            packages={collectionPackages}
            previewPackageId={previewPackageId}
            appliedPackageId={appliedPackageId}
            onPreview={(pkg) => setPreviewPackageId(pkg.id)}
          />
        </>
      ) : null}

      {subscribedPackages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">Subscribed</p>
          <FeedFormulaPackGrid
            packages={subscribedPackages}
            previewPackageId={previewPackageId}
            appliedPackageId={appliedPackageId}
            subscribed
            onPreview={(pkg) => setPreviewPackageId(pkg.id)}
          />
        </>
      ) : null}

      {!hasAny ? (
        <p className="card-hint">
          Nothing saved yet. On <strong>Create</strong>, configure a sort and use <strong>Save to collection</strong>,
          or subscribe in Marketplace → Sorting formulas.
        </p>
      ) : null}

      {previewPackage ? (
        <div className="feed-formula-preview-wrap">
          <div className="feed-formula-preview-actions">
            <p className="card-hint">
              Previewing <strong>{previewPackage.name}</strong> v{previewPackage.version}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={previewIsApplied}
              onClick={() => applyPack(previewPackage)}
            >
              {previewIsApplied ? 'In use on this feed' : 'Use on this feed'}
            </button>
          </div>
          <FeedFormulaPreviewPanel expr={previewPackage.sortKey} variant="sort" />
        </div>
      ) : null}
    </div>
  )
}
