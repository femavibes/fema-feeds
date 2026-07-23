import { useEffect, useMemo, useState } from 'react'
import type { FeedConfig, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import {
  applyPersonalizationFormulaPack,
  personalizationFormulasMatch,
} from '../../lib/feed-personalization'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

function isPersonalizationPack(pkg: SortPackPackage): boolean {
  return (pkg.packKind ?? 'sort') === 'personalization'
}

export function PersonalizationFormulaFeedSection({ draft, onChange }: Props) {
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
  }, [])

  const pickerItems = useMemo(() => {
    const byId = new Map<string, SortPackPackage>()
    for (const sub of subscriptions) byId.set(sub.package.id, sub.package)
    for (const pkg of collection) byId.set(pkg.id, pkg)
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [subscriptions, collection])

  const applyPack = (pkg: SortPackPackage) => {
    onChange(applyPersonalizationFormulaPack(draft, pkg))
  }

  return (
    <div className="feed-sorting-packs feed-personalization-formula-packs">
      <p className="sidebar-block-title">Saved personalization formulas</p>
      {packRef ? (
        <p className="card-hint">
          Loaded from <strong>{packRef.label ?? 'saved formula'}</strong> v{packRef.versionPin}.
        </p>
      ) : activeFormula ? (
        <p className="card-hint">
          Custom formula in editor. Pick a saved formula below to replace it, or save the current
          one to My collection.
        </p>
      ) : (
        <p className="card-hint">
          Load a formula from My collection or a marketplace subscription, then edit if needed.
        </p>
      )}

      {pickerItems.length > 0 ? (
        <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
          {pickerItems.map((pkg) => {
            const selected =
              packRef?.packageId === pkg.id ||
              (!packRef && personalizationFormulasMatch(activeFormula, pkg.sortKey))
            return (
              <li key={pkg.id}>
                <button
                  type="button"
                  className={`logic-blocks-catalog-item${selected ? ' logic-blocks-catalog-item-active' : ''}`}
                  onClick={() => applyPack(pkg)}
                >
                  <span className="logic-blocks-catalog-name">{pkg.name}</span>
                  <span className="logic-blocks-catalog-sub">v{pkg.version}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="card-hint">
          No saved personalization formulas yet. Use <strong>Save to collection</strong> above, or
          subscribe in Marketplace → Personalization formulas.
        </p>
      )}
    </div>
  )
}
