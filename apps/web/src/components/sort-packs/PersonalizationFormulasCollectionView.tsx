import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  selectedId: string | null
  onSelect: (pkg: SortPackPackage) => void
}

export function PersonalizationFormulasCollectionView({ selectedId, onSelect }: Props) {
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCollection('personalization')
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-blocks-collection">
      <h3 className="collection-section-title">Native formulas</h3>
      {loading && <p className="card-hint">Loading personalization formulas…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No personalization formulas saved yet. Use <strong>Save to collection</strong> on a
          feed&apos;s Personalization tab (Formula mode).
        </p>
      )}
      <div className="marketplace-catalog-grid">
        {packages.map((pkg) => (
          <MarketplaceCatalogCard
            key={pkg.id}
            id={pkg.id}
            name={pkg.name}
            description={pkg.description}
            version={pkg.version}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={pkg.listing}
            updatedAt={pkg.updatedAt}
            productKind="ranker"
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
