import { useEffect, useMemo, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort } from '../../lib/marketplace-catalog'
import { sortMarketplacePackages } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

const EMPTY_HINT: Record<MarketplaceCatalogScope, string> = {
  all: 'No sort packs yet. Save a sort preset from a feed or My collection, or subscribe from the global marketplace.',
  deployment: 'No deployment sort packs yet. Save a sort preset from a feed or My collection.',
  global: 'No global sort packs yet.',
}

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: SortPackPackage) => void
}

export function SortPacksBrowseView({
  catalogScope,
  catalogSort,
  selectedId,
  subscribedIds,
  onSelect,
}: Props) {
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  const sortedPackages = useMemo(
    () => sortMarketplacePackages(packages, catalogSort),
    [packages, catalogSort],
  )

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCatalog(catalogScope)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [catalogScope])

  return (
    <div className="logic-blocks-browse">
      <p className="card-hint">
        Native sort formulas (L2Expr) you can apply on any feed&apos;s Sorting tab after subscribing.
      </p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && sortedPackages.length === 0 && (
        <p className="card-hint">{EMPTY_HINT[catalogScope]}</p>
      )}
      <div className="marketplace-catalog-grid">
        {sortedPackages.map((pkg) => (
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
            ownerDid={pkg.ownerDid}
            subscribed={subscribedIds.has(pkg.id)}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
