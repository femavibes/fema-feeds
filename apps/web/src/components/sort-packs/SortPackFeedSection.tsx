import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackPackage, SortPackUpdatePolicy, SortPackUpgradeHint } from '@cfb/core-types'

import { api } from '../../api/client'
import { useCurrentUserDid } from '../../hooks/useCurrentUserDid'
import { excludeOwnFromSubscribed } from '../../lib/feed-subscriptions'
import {
  applySortPack,
  hasSortPackRef,
  setSortPackUpdatePolicy,
} from '../../lib/feed-sorting'
import { FeedFormulaPreviewPanel } from '../l2/FeedFormulaPreviewPanel'
import { FeedFormulaPackGrid } from './FeedFormulaPackGrid'
import { SortPackVersionCompare } from './SortPackVersionCompare'
import { UpdatePolicySelect, updatePolicyHint } from './UpdatePolicySelect'

interface Props {
  draft: FeedConfig
  liveFeed: FeedConfig | null
  onApplySettings: (next: FeedConfig) => Promise<void>
  onStagingChange: (next: FeedConfig) => void
  onFeedUpdated?: (feed: FeedConfig) => void
  applyBusy?: boolean
  onPackExprResolved?: (expr: L2Expr | null) => void
  refreshKey?: number
}

export function SortPackFeedSection({
  draft,
  liveFeed,
  onApplySettings,
  onStagingChange,
  onFeedUpdated,
  applyBusy = false,
  onPackExprResolved,
  refreshKey = 0,
}: Props) {
  const userDid = useCurrentUserDid()
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [collection, setCollection] = useState<SortPackPackage[]>([])
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgrade, setUpgrade] = useState<SortPackUpgradeHint | null>(null)
  const [applyPolicy, setApplyPolicy] = useState<SortPackUpdatePolicy>('notify')
  const [compare, setCompare] = useState<{ fromVersion: string; toVersion: string; title: string } | null>(null)

  const packRef = liveFeed?.rank?.packRef ?? draft.rank?.packRef
  const appliedPackageId = packRef?.packageId ?? null
  const usingPack = hasSortPackRef(liveFeed?.rank ?? draft.rank)
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

  useEffect(() => {
    setApplyPolicy(packRef?.updatePolicy ?? 'notify')
  }, [packRef?.packageId, packRef?.updatePolicy])

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
      .then((res) => setUpgrade(res.upgrade))
      .catch(() => setUpgrade(null))
  }, [draft.feedId, packRef?.versionPin, packRef?.updatePolicy, refreshKey])

  const applyPack = async (pkg: SortPackPackage) => {
    const next = applySortPack(draft, pkg, applyPolicy)
    onStagingChange(next)
    await onApplySettings(next)
  }

  const applyUpgrade = async () => {
    if (!draft.feedId) return
    setUpgradeBusy(true)
    try {
      const res = await api.applyFeedSortPackUpgrade(draft.feedId)
      onFeedUpdated?.(res.feed)
      setUpgrade(null)
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
        <>
          <p className="card-hint">
            Using <strong>{packRef.label ?? 'sort pack'}</strong> v{packRef.versionPin}. Preview others below, then apply when ready.
          </p>
          <UpdatePolicySelect
            value={packRef.updatePolicy ?? 'notify'}
            onChange={(policy) => {
              const next = setSortPackUpdatePolicy(draft, policy)
              onStagingChange(next)
              void onApplySettings(next)
            }}
          />
        </>
      ) : (
        <p className="card-hint">
          Preview a formula from My collection or a marketplace subscription. Apply only when you want it on this feed.
        </p>
      )}

      {upgrade ? (
        <div className="feed-sorting-upgrade feed-logic-upgrades-item">
          <p className="settings-hint">
            <strong>{upgrade.label ?? upgrade.packageName}</strong> v{upgrade.pinnedVersion} → v{upgrade.latestVersion}
            {' · '}{updatePolicyHint(upgrade.updatePolicy, upgrade.patchUpgrade)}
          </p>
          <div className="feed-formula-preview-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={upgradeBusy}
              onClick={() =>
                setCompare({
                  fromVersion: upgrade.pinnedVersion,
                  toVersion: upgrade.latestVersion,
                  title: upgrade.label ?? upgrade.packageName,
                })
              }
            >
              Compare
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={upgradeBusy}
              onClick={() => void applyUpgrade()}
            >
              {upgradeBusy ? 'Updating…' : `Upgrade to v${upgrade.latestVersion}`}
            </button>
          </div>
        </div>
      ) : null}

      <div className="feed-formula-library-layout">
        <div className="feed-formula-library-picks">
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
        </div>

        <div className="feed-formula-library-preview">
          {previewPackage ? (
            <>
              <div className="feed-formula-preview-actions">
                <p className="card-hint">
                  Previewing <strong>{previewPackage.name}</strong> v{previewPackage.version}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={previewIsApplied || applyBusy}
                  onClick={() => void applyPack(previewPackage)}
                >
                  {previewIsApplied ? 'In use on this feed' : 'Use on this feed'}
                </button>
              </div>
              {!previewIsApplied ? (
                <UpdatePolicySelect value={applyPolicy} onChange={setApplyPolicy} />
              ) : null}
              <FeedFormulaPreviewPanel expr={previewPackage.sortKey} variant="sort" />
            </>
          ) : (
            <p className="card-hint feed-formula-library-preview-empty">
              Select a formula to preview its expression and signals.
            </p>
          )}
        </div>
      </div>

      {compare && (upgrade?.packageId ?? appliedPackageId) ? (
        <SortPackVersionCompare
          packageId={upgrade?.packageId ?? appliedPackageId!}
          fromVersion={compare.fromVersion}
          toVersion={compare.toVersion}
          title={compare.title}
          variant="sort"
          onClose={() => setCompare(null)}
        />
      ) : null}
    </div>
  )
}
