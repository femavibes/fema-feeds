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
  const [sortPacks, setSortPacks] = useState<SortPackPackage[]>([])
  const [injectors, setInjectors] = useState<PluginPackage[]>([])
  const [rankers, setRankers] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockCollection(),
      api.listSortPackCollection(),
      api.listPluginCollection('injector'),
      api.listPluginCollection('ranker'),
    ])
      .then(([logicRes, sortRes, injectorRes, rankerRes]) => {
        setLogicBlocks(logicRes.packages)
        setSortPacks(sortRes.packages)
        setInjectors(injectorRes.packages.filter((p) => p.kind === 'injector'))
        setRankers(rankerRes.packages.filter((p) => p.kind === 'ranker'))
      })
      .catch(() => {
        setLogicBlocks([])
        setSortPacks([])
        setInjectors([])
        setRankers([])
      })
      .finally(() => setLoading(false))
  }, [])

  const totalCount = logicBlocks.length + sortPacks.length + injectors.length + rankers.length

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
          selected={selection?.kind === 'logic_block' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'logic_block', pkg })}
        />
      ),
    },
    {
      id: 'sort_packs' as const,
      title: marketplaceProduct('sort_packs').label,
      items: sortPacks,
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
          selected={selection?.kind === 'sort_pack' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'sort_pack', pkg })}
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
          selected={selection?.kind === 'injector' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'injector', pkg })}
        />
      ),
    },
    {
      id: 'rankers' as const,
      title: marketplaceProduct('rankers').label,
      items: rankers,
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
          selected={selection?.kind === 'ranker' && selection.pkg.id === pkg.id}
          onClick={() => onSelect({ kind: 'ranker', pkg })}
        />
      ),
    },
  ]

  return (
    <div className="marketplace-featured-browse collection-all-view">
      <p className="card-hint">
        Everything you own across product types. Use the sidebar to jump to a single category or create
        new packages from the footer actions.
      </p>
      {loading && <p className="card-hint">Loading your collection…</p>}
      {!loading && totalCount === 0 && (
        <p className="card-hint">
          No packages yet. Create a logic block, save a sort pack from a feed, or add custom code from
          the sidebar.
        </p>
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
