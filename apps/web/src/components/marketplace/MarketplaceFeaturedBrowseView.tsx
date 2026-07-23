import { useEffect, useMemo, useState } from 'react'
import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type {
  MarketplaceCatalogScope,
  MarketplaceCatalogSort,
  MarketplaceCategoryFilter,
  MarketplaceTierFilter,
} from '../../lib/marketplace-catalog'
import { sortMarketplacePackages, filterByCategory, filterByTier } from '../../lib/marketplace-catalog'
import { marketplaceProduct } from '../../lib/marketplace-products'
import { MarketplaceCatalogCard } from './MarketplaceCatalogCard'

export type MarketplaceFeaturedSelection =
  | { kind: 'logic_block'; pkg: LogicBlockPackage }
  | { kind: 'sort_pack'; pkg: SortPackPackage }
  | { kind: 'injector'; pkg: PluginPackage }
  | { kind: 'ranker'; pkg: PluginPackage }
  | { kind: 'enricher'; pkg: PluginPackage }

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  catalogCategory?: MarketplaceCategoryFilter
  catalogTier?: MarketplaceTierFilter
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
  catalogCategory = 'all',
  catalogTier = 'all',
  selection,
  logicSubscribedIds,
  sortSubscribedIds,
  injectorSubscribedIds,
  rankerSubscribedIds,
  onSelect,
}: Props) {
  const [logicBlocks, setLogicBlocks] = useState<LogicBlockPackage[]>([])
  const [sortPacks, setSortPacks] = useState<SortPackPackage[]>([])
  const [personalizationFormulas, setPersonalizationFormulas] = useState<SortPackPackage[]>([])
  const [injectors, setInjectors] = useState<PluginPackage[]>([])
  const [rankers, setRankers] = useState<PluginPackage[]>([])
  const [enrichers, setEnrichers] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockCatalog(catalogScope),
      api.listSortPackCatalog(catalogScope),
      api.listPluginCatalog('injector', catalogScope),
      api.listPluginCatalog('ranker', catalogScope),
      api.listPluginCatalog('enricher', catalogScope),
    ])
      .then(([logicRes, sortRes, injectorRes, rankerRes, enricherRes]) => {
        setLogicBlocks(logicRes.packages)
        setSortPacks(sortRes.packages.filter((pkg) => (pkg.packKind ?? 'sort') === 'sort'))
        setPersonalizationFormulas(sortRes.packages.filter((pkg) => pkg.packKind === 'personalization'))
        setInjectors(injectorRes.packages)
        setRankers(rankerRes.packages)
        setEnrichers(enricherRes.packages)
      })
      .catch(() => {
        setLogicBlocks([])
        setSortPacks([])
        setPersonalizationFormulas([])
        setInjectors([])
        setRankers([])
        setEnrichers([])
      })
      .finally(() => setLoading(false))
  }, [catalogScope])

  const sortedLogic = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(filterByTier(logicBlocks, catalogTier, () => 'native'), catalogSort),
        catalogCategory,
      ),
    [logicBlocks, catalogSort, catalogCategory, catalogTier],
  )
  const sortedSort = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(filterByTier(sortPacks, catalogTier, () => 'native'), catalogSort),
        catalogCategory,
      ),
    [sortPacks, catalogSort, catalogCategory, catalogTier],
  )
  const sortedPersonalizationFormulas = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(
          filterByTier(personalizationFormulas, catalogTier, () => 'native'),
          catalogSort,
        ),
        catalogCategory,
      ),
    [personalizationFormulas, catalogSort, catalogCategory, catalogTier],
  )
  const sortedRankers = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(filterByTier(rankers, catalogTier, () => 'custom_code'), catalogSort),
        catalogCategory,
      ),
    [rankers, catalogSort, catalogCategory, catalogTier],
  )
  const sortedInjectors = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(filterByTier(injectors, catalogTier, () => 'custom_code'), catalogSort),
        catalogCategory,
      ),
    [injectors, catalogSort, catalogCategory, catalogTier],
  )
  const sortedEnrichers = useMemo(
    () =>
      filterByCategory(
        sortMarketplacePackages(filterByTier(enrichers, catalogTier, () => 'custom_code'), catalogSort),
        catalogCategory,
      ),
    [enrichers, catalogSort, catalogCategory, catalogTier],
  )

  const personalizationItems = useMemo(() => {
    if (catalogTier === 'custom_code') return sortedRankers
    if (catalogTier === 'native') return sortedPersonalizationFormulas
    return [...sortedPersonalizationFormulas, ...sortedRankers]
  }, [catalogTier, sortedPersonalizationFormulas, sortedRankers])

  const totalCount =
    sortedLogic.length +
    sortedSort.length +
    personalizationItems.length +
    sortedInjectors.length +
    sortedEnrichers.length

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
          executionTier="native"
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
          executionTier="native"
          subscribed={sortSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'sort_pack' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'sort_pack', pkg })}
        />
      ),
    },
    {
      id: 'rankers' as const,
      title: marketplaceProduct('rankers').label,
      items: personalizationItems,
      render: (item: SortPackPackage | PluginPackage) =>
        'sortKey' in item ? (
          <MarketplaceCatalogCard
            key={item.id}
            id={item.id}
            name={item.name}
            description={item.description}
            version={item.version}
            visibility={item.visibility}
            trustTier={item.trustTier}
            listing={item.listing}
            updatedAt={item.updatedAt}
            productKind="sort_pack"
            ownerDid={item.ownerDid}
            executionTier="native"
            subscribed={sortSubscribedIds.has(item.id)}
            selected={selection?.kind === 'sort_pack' && selection.pkg.id === item.id}
            sources={(item as any)._sources}
            onClick={() => onSelect({ kind: 'sort_pack', pkg: item as SortPackPackage })}
          />
        ) : (
          <MarketplaceCatalogCard
            key={item.id}
            id={item.id}
            name={item.name}
            description={item.description}
            version={item.version}
            visibility={item.visibility}
            trustTier={item.trustTier}
            listing={item.listing}
            updatedAt={item.updatedAt}
            productKind="ranker"
            ownerDid={item.ownerDid}
            executionTier="custom_code"
            subtitle={(item as PluginPackage).runtime}
            subscribed={rankerSubscribedIds.has(item.id)}
            selected={selection?.kind === 'ranker' && selection.pkg.id === item.id}
            sources={(item as any)._sources}
            onClick={() => onSelect({ kind: 'ranker', pkg: item as PluginPackage })}
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
          executionTier="custom_code"
          subtitle={pkg.runtime}
          subscribed={injectorSubscribedIds.has(pkg.id)}
          selected={selection?.kind === 'injector' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'injector', pkg })}
        />
      ),
    },
    {
      id: 'enrichers' as const,
      title: marketplaceProduct('enrichers').label,
      items: sortedEnrichers,
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
          productKind="enricher"
          ownerDid={pkg.ownerDid}
          executionTier="custom_code"
          subtitle={pkg.runtime}
          selected={selection?.kind === 'enricher' && selection.pkg.id === pkg.id}
          sources={(pkg as any)._sources}
          onClick={() => onSelect({ kind: 'enricher', pkg })}
        />
      ),
    },
  ]

  return (
    <div className="marketplace-featured-browse">
      <p className="card-hint">
        Highlights across all marketplace categories. Pick a category in the sidebar to focus, or
        use the tier filter for native formulas vs custom code (WASM / remote).
      </p>
      {loading && <p className="card-hint">Loading marketplace…</p>}
      {!loading && totalCount === 0 && (
        <p className="card-hint">No listings yet. Publish packages from My collection or browse when items appear.</p>
      )}
      <div className="marketplace-featured-sections">
        {sections.map((section) =>
          section.items.length === 0 ? null : (
            <section key={section.id} className="marketplace-featured-section" aria-label={section.title}>
              <h3 className="marketplace-featured-section-title">{section.title}</h3>
              <div className="marketplace-catalog-grid">
                {section.items.map((pkg) => section.render(pkg as never))}
              </div>
            </section>
          ),
        )}
      </div>
    </div>
  )
}
