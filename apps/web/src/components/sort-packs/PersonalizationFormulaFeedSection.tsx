import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackPackage, SortPackRef } from '@cfb/core-types'

import { api } from '../../api/client'
import {
  applyPersonalizationFormulaPack,
  personalizationFormulasMatch,
} from '../../lib/feed-personalization'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  refreshKey?: number
}

function isPersonalizationPack(pkg: SortPackPackage): boolean {
  return (pkg.packKind ?? 'sort') === 'personalization'
}

function FormulaPackList({
  items,
  packRef,
  activeFormula,
  onApply,
}: {
  items: SortPackPackage[]
  packRef?: SortPackRef
  activeFormula?: L2Expr
  onApply: (pkg: SortPackPackage) => void
}) {
  if (items.length === 0) return null
  return (
    <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
      {items.map((pkg) => {
        const selected =
          packRef?.packageId === pkg.id ||
          (!packRef && personalizationFormulasMatch(activeFormula, pkg.sortKey))
        return (
          <li key={pkg.id}>
            <button
              type="button"
              className={`logic-blocks-catalog-item${selected ? ' logic-blocks-catalog-item-active' : ''}`}
              onClick={() => onApply(pkg)}
            >
              <span className="logic-blocks-catalog-name">{pkg.name}</span>
              <span className="logic-blocks-catalog-sub">v{pkg.version}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function PersonalizationFormulaFeedSection({ draft, onChange, refreshKey = 0 }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listSortPackSubscriptions>>['subscriptions']
  >([])
  const [collection, setCollection] = useState<SortPackPackage[]>([])

  const packRef = draft.personalization?.formulaPackRef
  const activeFormula = draft.personalization?.formula

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

  const subscribedPackages = useMemo(
    () =>
      [...subscriptions]
        .map((s) => s.package)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [subscriptions],
  )

  const collectionPackages = useMemo(
    () => [...collection].sort((a, b) => a.name.localeCompare(b.name)),
    [collection],
  )

  const applyPack = (pkg: SortPackPackage) => {
    onChange(applyPersonalizationFormulaPack(draft, pkg))
  }

  const hasAny = collectionPackages.length > 0 || subscribedPackages.length > 0

  return (
    <div className="feed-sorting-packs feed-personalization-formula-packs">
      <p className="sidebar-block-title">Native personalization formulas</p>
      {packRef ? (
        <p className="card-hint">
          Using <strong>{packRef.label ?? 'saved formula'}</strong> v{packRef.versionPin}. Pick another
          formula below or switch to Create to edit inline.
        </p>
      ) : activeFormula ? (
        <p className="card-hint">
          Custom formula on this feed. Pick a saved formula below to replace it, or stay on Create to keep
          editing.
        </p>
      ) : (
        <p className="card-hint">
          Apply a formula from My collection or a marketplace subscription. Switch to Create to write a new
          one from scratch.
        </p>
      )}

      {collectionPackages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">My collection</p>
          <FormulaPackList
            items={collectionPackages}
            packRef={packRef}
            activeFormula={activeFormula}
            onApply={applyPack}
          />
        </>
      ) : null}

      {subscribedPackages.length > 0 ? (
        <>
          <p className="feed-formula-pack-group-label">Subscribed</p>
          <FormulaPackList
            items={subscribedPackages}
            packRef={packRef}
            activeFormula={activeFormula}
            onApply={applyPack}
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
  )
}
