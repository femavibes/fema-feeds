import { useEffect, useMemo, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort, MarketplaceCategoryFilter, MarketplaceTierFilter } from '../../lib/marketplace-catalog'
import { sortMarketplacePackages, filterByCategory, filterByTier } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  kind?: PluginKind
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  catalogCategory?: MarketplaceCategoryFilter
  catalogTier?: MarketplaceTierFilter
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: PluginPackage) => void
}

const KIND_HINT: Record<
  PluginKind,
  { intro: string; empty: Record<MarketplaceCatalogScope, string> }
> = {
  injector: {
    intro:
      "Post-sort injectors for ads and promos. Subscribe here, then wire slots on a feed's Sorting tab.",
    empty: {
      all: 'No injectors yet. Operator instances may seed demo listings on this deployment.',
      deployment:
        'No deployment injectors yet. Operator instances seed a demo static-URI injector.',
      global: 'No global injectors yet.',
    },
  },
  ranker: {
    intro:
      "Custom code personalization plugins reorder skeleton pages at serve time (WASM or remote). Native formulas are listed separately in this category when you filter by tier.",
    empty: {
      all: 'No personalization plugins yet. Operator instances may seed demo listings on this deployment.',
      deployment: 'No deployment personalization plugins yet. Operator instances seed a demo pinned-URI plugin.',
      global: 'No global personalization plugins yet.',
    },
  },
  enricher: {
    intro:
      'Enrichers augment posts with additional data (ML tags, video analysis, etc.). Subscribe to add fields that logic blocks and sort formulas can use.',
    empty: {
      all: 'No enrichers yet.',
      deployment: 'No deployment enrichers yet.',
      global: 'No global enrichers yet.',
    },
  },
}

export function InjectorsBrowseView({
  kind = 'injector',
  catalogScope,
  catalogSort,
  catalogCategory = 'all',
  catalogTier = 'all',
  selectedId,
  subscribedIds,
  onSelect,
}: Props) {
  const [packages, setPackages] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  const sortedPackages = useMemo(() => {
    const tierFiltered = filterByTier(packages, catalogTier, () => 'custom_code')
    return filterByCategory(sortMarketplacePackages(tierFiltered, catalogSort), catalogCategory)
  }, [packages, catalogSort, catalogCategory, catalogTier])

  useEffect(() => {
    setLoading(true)
    void api
      .listPluginCatalog(kind, catalogScope)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [catalogScope, kind])

  const copy = KIND_HINT[kind]

  return (
    <div className="logic-blocks-browse">
      <p className="card-hint">{copy.intro}</p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && sortedPackages.length === 0 && (
        <p className="card-hint">{copy.empty[catalogScope]}</p>
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
            productKind={kind}
            ownerDid={pkg.ownerDid}
            executionTier="custom_code"
            subtitle={pkg.runtime}
            subscribed={subscribedIds.has(pkg.id)}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
