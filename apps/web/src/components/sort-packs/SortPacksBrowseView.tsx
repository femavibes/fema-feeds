import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockTrustBadge } from '../logic-blocks/logic-block-labels'

export type BrowseCatalogScope = 'deployment' | 'global'

interface Props {
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: SortPackPackage) => void
}

export function SortPacksBrowseView({ selectedId, subscribedIds, onSelect }: Props) {
  const [scope, setScope] = useState<BrowseCatalogScope>('deployment')
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCatalog(scope)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [scope])

  return (
    <div className="logic-blocks-browse">
      <div className="logic-blocks-browse-scope" role="tablist" aria-label="Catalog scope">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'deployment'}
          className={`logic-blocks-scope-btn${scope === 'deployment' ? ' active' : ''}`}
          onClick={() => setScope('deployment')}
        >
          This deployment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'global'}
          className={`logic-blocks-scope-btn${scope === 'global' ? ' active' : ''}`}
          onClick={() => setScope('global')}
        >
          Global marketplace
        </button>
      </div>

      <p className="card-hint">
        Native sort formulas (L2Expr) you can apply on any feed&apos;s Sorting tab after subscribing.
      </p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          {scope === 'deployment'
            ? 'No deployment sort packs yet. Save a sort preset from a feed or My collection.'
            : 'No global sort packs yet.'}
        </p>
      )}
      <ul className="logic-blocks-catalog-list">
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <button
              type="button"
              className={`logic-blocks-catalog-item${selectedId === pkg.id ? ' is-selected' : ''}`}
              onClick={() => onSelect(pkg)}
            >
              <div className="logic-blocks-catalog-meta">
                <span className="logic-blocks-catalog-name">{pkg.name}</span>
                <span className="logic-blocks-catalog-sub">
                  v{pkg.version}
                  {subscribedIds.has(pkg.id) ? ' · Subscribed' : ''}
                </span>
                {pkg.description ? (
                  <span className="logic-blocks-catalog-desc">{pkg.description}</span>
                ) : null}
              </div>
              <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
