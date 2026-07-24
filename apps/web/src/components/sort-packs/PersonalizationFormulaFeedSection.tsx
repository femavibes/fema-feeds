import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, SortPackPackage, SortPackUpdatePolicy, SortPackUpgradeHint } from '@cfb/core-types'

import { api } from '../../api/client'
import { useCurrentUserDid } from '../../hooks/useCurrentUserDid'
import {
  applyPersonalizationFormulaPack,
  setPersonalizationFormulaUpdatePolicy,
} from '../../lib/feed-personalization'
import { excludeOwnFromSubscribed } from '../../lib/feed-subscriptions'
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
  refreshKey?: number
}

function isPersonalizationPack(pkg: SortPackPackage): boolean {
  return (pkg.packKind ?? 'sort') === 'personalization'
}

export function PersonalizationFormulaFeedSection({
  draft,
  liveFeed,
  onApplySettings,
  onStagingChange,
  onFeedUpdated,
  applyBusy = false,
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

  const packRef = liveFeed?.personalization?.formulaPackRef ?? draft.personalization?.formulaPackRef
  const appliedPackageId = packRef?.packageId ?? null
  const [previewPackageId, setPreviewPackageId] = useState<string | null>(appliedPackageId)

  useEffect(() => {
    void Promise.all([
      api.listSortPackSubscriptions(),
      api.listSortPackCollection('personalization'),
    ])
      .then(([subsRes, collectionRes]) => {
        setSubscriptions(subsRes.subscriptions.filter((s) => isPersonalizationPack(s.package)))
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

  useEffect(() => {
    if (!draft.feedId) return
    void api
      .getFeedFormulaPackUpgrade(draft.feedId)
      .then((res) => setUpgrade(res.upgrade))
      .catch(() => setUpgrade(null))
  }, [draft.feedId, packRef?.versionPin, packRef?.updatePolicy, refreshKey])

  const subscribedPackages = useMemo(
    () =>
      excludeOwnFromSubscribed(
        [...subscriptions]
          .map((s) => s.package)
          .sort((a, b) => a.name.localeCompare(b.name)),
        { userDid, collectionPackageIds: collection.map((p) => p.id) },
      ),
    [subscriptions, userDid, collection],
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

  const applyPack = async (pkg: SortPackPackage) => {
    const next = applyPersonalizationFormulaPack(draft, pkg, applyPolicy)
    onStagingChange(next)
    await onApplySettings(next)
  }

  const applyUpgrade = async () => {
    if (!draft.feedId) return
    setUpgradeBusy(true)
    try {
      const res = await api.applyFeedFormulaPackUpgrade(draft.feedId)
      onFeedUpdated?.(res.feed)
      setUpgrade(null)
    } finally {
      setUpgradeBusy(false)
    }
  }

  const hasAny = collectionPackages.length > 0 || subscribedPackages.length > 0
  const previewIsApplied = previewPackageId != null && previewPackageId === appliedPackageId

  return (
    <div className="feed-sorting-packs feed-personalization-formula-packs">
      <p className="sidebar-block-title">Native personalization formulas</p>
      {packRef ? (
        <>
          <p className="card-hint">
            Using <strong>{packRef.label ?? 'saved formula'}</strong> v{packRef.versionPin}. Preview others below, then apply when ready.
          </p>
          <UpdatePolicySelect
            value={packRef.updatePolicy ?? 'notify'}
            onChange={(policy) => {
              const next = setPersonalizationFormulaUpdatePolicy(draft, policy)
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
              Nothing saved yet. On <strong>Create</strong>, write a formula and use <strong>Save to collection</strong>,
              or subscribe in Marketplace → Personalization formulas.
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
              <FeedFormulaPreviewPanel expr={previewPackage.sortKey} variant="personalization" />
            </>
          ) : (
            <p className="card-hint feed-formula-library-preview-empty">
              Select a formula to preview its expression.
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
          variant="personalization"
          onClose={() => setCompare(null)}
        />
      ) : null}
    </div>
  )
}
