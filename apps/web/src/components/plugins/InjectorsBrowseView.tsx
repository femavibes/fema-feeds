import { useEffect, useMemo, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort } from '../../lib/marketplace-catalog'
import { sortMarketplacePackages } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  kind?: PluginKind
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
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
      "Custom rankers reorder skeleton pages at serve time. Subscribe here, then apply on a feed's Sorting tab.",
    empty: {
      all: 'No rankers yet. Operator instances may seed demo listings on this deployment.',
      deployment: 'No deployment rankers yet. Operator instances seed a demo pinned-URI ranker.',
      global: 'No global rankers yet.',
    },
  },
}

export function InjectorsBrowseView({
  kind = 'injector',
  catalogScope,
  catalogSort,
  selectedId,
  subscribedIds,
  onSelect,
}: Props) {
  const [packages, setPackages] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  const sortedPackages = useMemo(
    () => sortMarketplacePackages(packages, catalogSort),
    [packages, catalogSort],
  )

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
