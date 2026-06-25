import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  selectedId: string | null
  onSelect: (pkg: SortPackPackage) => void
}

export function SortPacksCollectionView({ selectedId, onSelect }: Props) {
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCollection()
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-blocks-collection">
      {loading && <p className="card-hint">Loading sort packs…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No sort packs saved yet. Use <strong>Save sort to collection</strong> on a feed&apos;s Sorting tab.
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
            productKind="sort_pack"
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
