import { useEffect, useMemo, useState } from 'react'
import type { PluginPackage, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type {
  MarketplaceCatalogScope,
  MarketplaceCatalogSort,
  MarketplaceCategoryFilter,
  MarketplaceTierFilter,
} from '../../lib/marketplace-catalog'
import { sortMarketplacePackages, filterByCategory, filterByTier } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

type BrowseItem =
  | { tier: 'native'; kind: 'sort_pack'; pkg: SortPackPackage }
  | { tier: 'custom_code'; kind: 'ranker'; pkg: PluginPackage }

const EMPTY_HINT: Record<MarketplaceCatalogScope, string> = {
  all: 'No personalization formulas or plugins yet. Save a native formula from a feed Personalization tab, or browse published custom code.',
  deployment:
    'No deployment personalization listings yet. Save native formulas from My collection or publish custom code when verified.',
  global: 'No global personalization listings yet.',
}

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  catalogCategory?: MarketplaceCategoryFilter
  catalogTier?: MarketplaceTierFilter
  selectedSortId: string | null
  selectedPluginId: string | null
  sortSubscribedIds: Set<string>
  rankerSubscribedIds: Set<string>
  onSelectFormula: (pkg: SortPackPackage) => void
  onSelectPlugin: (pkg: PluginPackage) => void
}

export function PersonalizationFormulasBrowseView({
  catalogScope,
  catalogSort,
  catalogCategory = 'all',
  catalogTier = 'all',
  selectedSortId,
  selectedPluginId,
  sortSubscribedIds,
  rankerSubscribedIds,
  onSelectFormula,
  onSelectPlugin,
}: Props) {
  const [formulas, setFormulas] = useState<SortPackPackage[]>([])
  const [plugins, setPlugins] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      api.listSortPackCatalog(catalogScope),
      api.listPluginCatalog('ranker', catalogScope),
    ])
      .then(([sortRes, pluginRes]) => {
        setFormulas(sortRes.packages.filter((pkg) => pkg.packKind === 'personalization'))
        setPlugins(pluginRes.packages)
      })
      .catch(() => {
        setFormulas([])
        setPlugins([])
      })
      .finally(() => setLoading(false))
  }, [catalogScope])

  const items = useMemo(() => {
    const nativeItems: BrowseItem[] = formulas.map((pkg) => ({
      tier: 'native',
      kind: 'sort_pack',
      pkg,
    }))
    const customItems: BrowseItem[] = plugins.map((pkg) => ({
      tier: 'custom_code',
      kind: 'ranker',
      pkg,
    }))
    const merged = [...nativeItems, ...customItems]
    const tierFiltered = filterByTier(merged, catalogTier, (item) => item.tier)
    const sortedNative = sortMarketplacePackages(
      tierFiltered.filter((item) => item.tier === 'native').map((item) => item.pkg),
      catalogSort,
    )
    const sortedCustom = sortMarketplacePackages(
      tierFiltered.filter((item) => item.tier === 'custom_code').map((item) => item.pkg),
      catalogSort,
    )
    const nativeFiltered = filterByCategory(sortedNative, catalogCategory).map(
      (pkg): BrowseItem => ({ tier: 'native', kind: 'sort_pack', pkg }),
    )
    const customFiltered = filterByCategory(sortedCustom, catalogCategory).map(
      (pkg): BrowseItem => ({ tier: 'custom_code', kind: 'ranker', pkg }),
    )
    return [...nativeFiltered, ...customFiltered]
  }, [formulas, plugins, catalogSort, catalogCategory, catalogTier])

  return (
    <div className="logic-blocks-browse">
      <p className="card-hint">
        Personalization reorders the top of each skeleton page per viewer. Native formulas run in
        this app&apos;s formula engine; custom code plugins use WASM or remote endpoints.
      </p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && items.length === 0 && (
        <p className="card-hint">{EMPTY_HINT[catalogScope]}</p>
      )}
      <div className="marketplace-catalog-grid">
        {items.map((item) =>
          item.tier === 'native' ? (
            <MarketplaceCatalogCard
              key={`formula-${item.pkg.id}`}
              id={item.pkg.id}
              name={item.pkg.name}
              description={item.pkg.description}
              version={item.pkg.version}
              visibility={item.pkg.visibility}
              trustTier={item.pkg.trustTier}
              listing={item.pkg.listing}
              updatedAt={item.pkg.updatedAt}
              productKind="sort_pack"
              ownerDid={item.pkg.ownerDid}
              executionTier="native"
              subscribed={sortSubscribedIds.has(item.pkg.id)}
              selected={selectedSortId === item.pkg.id}
              onClick={() => onSelectFormula(item.pkg)}
            />
          ) : (
            <MarketplaceCatalogCard
              key={`plugin-${item.pkg.id}`}
              id={item.pkg.id}
              name={item.pkg.name}
              description={item.pkg.description}
              version={item.pkg.version}
              visibility={item.pkg.visibility}
              trustTier={item.pkg.trustTier}
              listing={item.pkg.listing}
              updatedAt={item.pkg.updatedAt}
              productKind="ranker"
              ownerDid={item.pkg.ownerDid}
              executionTier="custom_code"
              subtitle={item.pkg.runtime}
              subscribed={rankerSubscribedIds.has(item.pkg.id)}
              selected={selectedPluginId === item.pkg.id}
              onClick={() => onSelectPlugin(item.pkg)}
            />
          ),
        )}
      </div>
    </div>
  )
}
