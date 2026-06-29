import { useEffect, useMemo, useState } from 'react'
import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort } from '../../lib/marketplace-catalog'
import { sortMarketplacePackages } from '../../lib/marketplace-catalog'
import { marketplaceProduct } from '../../lib/marketplace-products'
import { MarketplaceCatalogCard } from './MarketplaceCatalogCard'

export type MarketplaceFeaturedSelection =
  | { kind: 'logic_block'; pkg: LogicBlockPackage }
  | { kind: 'sort_pack'; pkg: SortPackPackage }
  | { kind: 'injector'; pkg: PluginPackage }
  | { kind: 'ranker'; pkg: PluginPackage }

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  selection: MarketplaceFeaturedSelection | null
  logicSubscribedIds: Set<string>
  sortSubscribedIds: Set<string>
  injectorSubscribedIds: Set<string>
  rankerSubscribedIds: Set<string>
  onSelect: (next: MarketplaceFeaturedSelection) => void
}

export function MarketplaceFeaturedBrowseView({
  catalogScope,
  catalogSort,
  selection,
  logicSubscribedIds,
  sortSubscribedIds,
  injectorSubscribedIds,
  rankerSubscribedIds,
  onSelect,
}: Props) {
  const [logicBlocks, setLogicBlocks] = useState<LogicBlockPackage[]>([])
  const [sortPacks, setSortPacks] = useState<SortPackPackage[]>([])
  const [injectors, setInjectors] = useState<PluginPackage[]>([])
  const [rankers, setRankers] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockCatalog(catalogScope),
      api.listSortPackCatalog(catalogScope),
      api.listPluginCatalog('injector', catalogScope),
      api.listPluginCatalog('ranker', catalogScope),
    ])
      .then(([logicRes, sortRes, injectorRes, rankerRes]) => {
        setLogicBlocks(logicRes.packages)
        setSortPacks(sortRes.packages)
        setInjectors(injectorRes.packages)
        setRankers(rankerRes.packages)
      })
      .catch(() => {
        setLogicBlocks([])
        setSortPacks([])
        setInjectors([])
        setRankers([])
      })
      .finally(() => setLoading(false))
  }, [catalogScope])

  const sortedLogic = useMemo(() => sortMarketplacePackages(logicBlocks, catalogSort), [logicBlocks, catalogSort])
  const sortedSort = useMemo(() => sortMarketplacePackages(sortPacks, catalogSort), [sortPacks, catalogSort])
  const sortedInjectors = useMemo(
    () => sortMarketplacePackages(injectors, catalogSort),
    [injectors, catalogSort],
  )
  const sortedRankers = useMemo(() => sortMarketplacePackages(rankers, catalogSort), [rankers, catalogSort])

  const totalCount = sortedLogic.length + sortedSort.length + sortedInjectors.length + sortedRankers.length

  const sections = [
    {
      id: 'logic_blocks' as const,
      title: marketplaceProduct('logic_blocks').label,
      items: sortedLogic,
      render: (pkg: LogicBlockPackage) => (
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
          productKind="logic_block"
          ownerDid={pkg.ownerDid}
          subscribed={logicSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'logic_block' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'logic_block', pkg })}
        />
      ),
    },
    {
      id: 'sort_packs' as const,
      title: marketplaceProduct('sort_packs').label,
      items: sortedSort,
      render: (pkg: SortPackPackage) => (
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
          subscribed={sortSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'sort_pack' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'sort_pack', pkg })}
        />
      ),
    },
    {
      id: 'injectors' as const,
      title: marketplaceProduct('injectors').label,
      items: sortedInjectors,
      render: (pkg: PluginPackage) => (
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
          productKind="injector"
          ownerDid={pkg.ownerDid}
          subscribed={injectorSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'injector' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'injector', pkg })}
        />
      ),
    },
    {
      id: 'rankers' as const,
      title: marketplaceProduct('rankers').label,
      items: sortedRankers,
      render: (pkg: PluginPackage) => (
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
          ownerDid={pkg.ownerDid}
          subscribed={rankerSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'ranker' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'ranker', pkg })}
        />
      ),
    },
  ]

  return (
    <div className="marketplace-featured-browse">
      <p className="card-hint">
        Highlights across logic blocks, sort packs, injectors, and personalization plugins. Pick a category in the
        sidebar to focus one product type.
      </p>
      {loading && <p className="card-hint">Loading marketplaceâ€¦</p>}
      {!loading && totalCount === 0 && (
        <p className="card-hint">No listings yet. Publish packages from My collection or browse when items appear.</p>
      )}
      <div className="marketplace-featured-sections">
        {sections.map((section) =>
          section.items.length === 0 ? null : (
            <section key={section.id} className="marketplace-featured-section" aria-label={section.title}>
              <h3 className="marketplace-featured-section-title">{section.title}</h3>
              <div className="marketplace-catalog-grid">{section.items.map((pkg) => section.render(pkg as never))}</div>
            </section>
          ),
        )}
      </div>
    </div>
  )
}
