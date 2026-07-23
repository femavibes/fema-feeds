import { useEffect, useState } from 'react'
import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { marketplaceProduct } from '../../lib/marketplace-products'
import { MarketplaceCatalogCard } from './MarketplaceCatalogCard'

export type CollectionAllSelection =
  | { kind: 'logic_block'; pkg: LogicBlockPackage }
  | { kind: 'sort_pack'; pkg: SortPackPackage }
  | { kind: 'injector'; pkg: PluginPackage }
  | { kind: 'ranker'; pkg: PluginPackage }

interface Props {
  selection: CollectionAllSelection | null
  onSelect: (next: CollectionAllSelection) => void
}

export function CollectionAllView({ selection, onSelect }: Props) {
  const [logicBlocks, setLogicBlocks] = useState<LogicBlockPackage[]>([])
  const [sortingFormulas, setSortingFormulas] = useState<SortPackPackage[]>([])
  const [personalizationFormulas, setPersonalizationFormulas] = useState<SortPackPackage[]>([])
  const [injectors, setInjectors] = useState<PluginPackage[]>([])
  const [rankers, setRankers] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockCollection(),
      api.listSortPackCollection('sort'),
      api.listSortPackCollection('personalization'),
      api.listPluginCollection('injector'),
      api.listPluginCollection('ranker'),
    ])
      .then(([logicRes, sortRes, personalizationRes, injectorRes, rankerRes]) => {
        setLogicBlocks(logicRes.packages)
        setSortingFormulas(sortRes.packages)
        setPersonalizationFormulas(personalizationRes.packages)
        setInjectors(injectorRes.packages.filter((p) => p.kind === 'injector'))
        setRankers(rankerRes.packages.filter((p) => p.kind === 'ranker'))
      })
      .catch(() => {
        setLogicBlocks([])
        setSortingFormulas([])
        setPersonalizationFormulas([])
        setInjectors([])
        setRankers([])
      })
      .finally(() => setLoading(false))
  }, [])

  const totalCount =
    logicBlocks.length +
    sortingFormulas.length +
    personalizationFormulas.length +
    injectors.length +
    rankers.length

  const sections = [
    {
      id: 'logic_blocks' as const,
      title: marketplaceProduct('logic_blocks').label,
      items: logicBlocks,
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
          selected={selection?.kind === 'logic_block' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'logic_block', pkg })}
        />
      ),
    },
    {
      id: 'sort_packs' as const,
      title: marketplaceProduct('sort_packs').label,
      items: sortingFormulas,
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
          selected={selection?.kind === 'sort_pack' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'sort_pack', pkg })}
        />
      ),
    },
    {
      id: 'rankers' as const,
      title: marketplaceProduct('rankers').label,
      items: [...personalizationFormulas, ...rankers],
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
            selected={selection?.kind === 'sort_pack' && selection.pkg.id === item.id}
            onClick={() => onSelect({ kind: 'sort_pack', pkg: item })}
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
            subtitle={item.runtime}
            selected={selection?.kind === 'ranker' && selection.pkg.id === item.id}
            onClick={() => onSelect({ kind: 'ranker', pkg: item })}
          />
        ),
    },
    {
      id: 'injectors' as const,
      title: marketplaceProduct('injectors').label,
      items: injectors,
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
          selected={selection?.kind === 'injector' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'injector', pkg })}
        />
      ),
    },
  ]

  return (
    <div className="marketplace-featured-browse">
      {loading && <p className="card-hint">Loading your collection…</p>}
      {!loading && totalCount === 0 && (
        <p className="card-hint">
          Nothing saved yet. Create logic blocks here, or save sorting and personalization formulas from a feed.
        </p>
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
