import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { useCurrentUserDid } from '../../hooks/useCurrentUserDid'
import { applyPersonalizationFormulaPack } from '../../lib/feed-personalization'
import { excludeOwnFromSubscribed } from '../../lib/feed-subscriptions'
import { FeedFormulaPackGrid } from './FeedFormulaPackGrid'
import { FeedFormulaPreviewPanel } from '../l2/FeedFormulaPreviewPanel'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  refreshKey?: number
}

function isPersonalizationPack(pkg: SortPackPackage): boolean {
  return (pkg.packKind ?? 'sort') === 'personalization'
}

export function PersonalizationFormulaFeedSection({ draft, onChange, refreshKey = 0 }: Props) {
  const userDid = useCurrentUserDid()
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [collection, setCollection] = useState<SortPackPackage[]>([])

  const packRef = draft.personalization?.formulaPackRef
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

  const applyPack = (pkg: SortPackPackage) => {
    onChange(applyPersonalizationFormulaPack(draft, pkg))
  }

  const hasAny = collectionPackages.length > 0 || subscribedPackages.length > 0
  const previewIsApplied = previewPackageId != null && previewPackageId === appliedPackageId

  return (
    <div className="feed-sorting-packs feed-personalization-formula-packs">
      <p className="sidebar-block-title">Native personalization formulas</p>
      {packRef ? (
        <p className="card-hint">
          Using <strong>{packRef.label ?? 'saved formula'}</strong> v{packRef.versionPin}. Preview others below, then
          apply when ready.
        </p>
      ) : (
        <p className="card-hint">
          Preview a formula from My collection or a marketplace subscription. Apply only when you want it on this feed.
        </p>
      )}

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
                  disabled={previewIsApplied}
                  onClick={() => applyPack(previewPackage)}
                >
                  {previewIsApplied ? 'In use on this feed' : 'Use on this feed'}
                </button>
              </div>
              <FeedFormulaPreviewPanel expr={previewPackage.sortKey} variant="personalization" />
            </>
          ) : (
            <p className="card-hint feed-formula-library-preview-empty">
              Select a formula to preview its expression.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
