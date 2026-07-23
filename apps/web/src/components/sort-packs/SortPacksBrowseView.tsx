import { useEffect, useMemo, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type {
  MarketplaceCatalogScope,
  MarketplaceCatalogSort,
  MarketplaceCategoryFilter,
  MarketplaceTierFilter,
} from '../../lib/marketplace-catalog'
import { sortMarketplacePackages, filterByCategory, filterByTier } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

const EMPTY_HINT: Record<MarketplaceCatalogScope, string> = {
  all: 'No sorting formulas yet. Save one from a feed Sorting tab or My collection, or subscribe from the global marketplace.',
  deployment: 'No deployment sorting formulas yet. Save from a feed Sorting tab or My collection.',
  global: 'No global sorting formulas yet.',
}

const CUSTOM_CODE_EMPTY =
  'No custom code sorting packages published yet. Custom sorting will use WASM or remote endpoints like other custom code tiers.'

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  catalogCategory?: MarketplaceCategoryFilter
  catalogTier?: MarketplaceTierFilter
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: SortPackPackage) => void
}

export function SortPacksBrowseView({
  catalogScope,
  catalogSort,
  catalogCategory = 'all',
  catalogTier = 'all',
  selectedId,
  subscribedIds,
  onSelect,
}: Props) {
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  const sortedPackages = useMemo(() => {
    const sortingOnly = packages.filter((pkg) => (pkg.packKind ?? 'sort') === 'sort')
    const tierFiltered = filterByTier(sortingOnly, catalogTier, () => 'native')
    return filterByCategory(sortMarketplacePackages(tierFiltered, catalogSort), catalogCategory)
  }, [packages, catalogSort, catalogCategory, catalogTier])

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCatalog(catalogScope)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [catalogScope])

  const emptyHint =
    catalogTier === 'custom_code' ? CUSTOM_CODE_EMPTY : EMPTY_HINT[catalogScope]

  return (
    <div className="logic-blocks-browse">
      <p className="card-hint">
        Native sorting formulas (L2Expr) rank the candidate pool before pages are built. Apply on a
        feed&apos;s Sorting tab after subscribing. Custom code sorting uses WASM or remote endpoints
        when published.
      </p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && sortedPackages.length === 0 && (
        <p className="card-hint">{emptyHint}</p>
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
            executionTier="native"
            subscribed={subscribedIds.has(pkg.id)}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
