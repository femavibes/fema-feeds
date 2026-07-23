import { useEffect, useState } from 'react'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort, MarketplaceCategoryFilter, MarketplaceTierFilter } from '../../lib/marketplace-catalog'
import { MARKETPLACE_CATALOG_SORT_OPTIONS, MARKETPLACE_TIER_FILTER_OPTIONS } from '../../lib/marketplace-catalog'
import type { MarketplaceBrowseKind } from '../../lib/marketplace-products'
import { marketplaceProduct } from '../../lib/marketplace-products'
import { MarketplaceScopeToggle } from './MarketplaceScopeIcons'
import { getMarketplaceTaxonomy, type TaxonomyEntry } from '../../lib/marketplace-taxonomy'

interface Props {
  scope: MarketplaceCatalogScope
  sort: MarketplaceCatalogSort
  category: MarketplaceCategoryFilter
  tier: MarketplaceTierFilter
  productKind?: MarketplaceBrowseKind | 'all'
  onScopeChange: (scope: MarketplaceCatalogScope) => void
  onSortChange: (sort: MarketplaceCatalogSort) => void
  onCategoryChange: (category: MarketplaceCategoryFilter) => void
  onTierChange: (tier: MarketplaceTierFilter) => void
}

function tierOptionDisabled(
  value: MarketplaceTierFilter,
  productKind: MarketplaceBrowseKind | 'all' | undefined,
): boolean {
  if (value === 'all' || !productKind || productKind === 'all') return false
  const product = marketplaceProduct(productKind)
  if (value === 'native') return !product.supportsNative
  return !product.supportsCustomCode
}

export function MarketplaceCatalogControls({
  scope,
  sort,
  category,
  tier,
  productKind,
  onScopeChange,
  onSortChange,
  onCategoryChange,
  onTierChange,
}: Props) {
  const [categories, setCategories] = useState<TaxonomyEntry[]>([])

  useEffect(() => {
    void getMarketplaceTaxonomy().then((t) => setCategories(t.categories))
  }, [])

  return (
    <div className="marketplace-catalog-controls">
      <div className="marketplace-catalog-control">
        <span className="marketplace-catalog-control-label">Catalog</span>
        <MarketplaceScopeToggle value={scope} onChange={onScopeChange} />
      </div>
      <label className="marketplace-catalog-control">
        <span className="marketplace-catalog-control-label">Tier</span>
        <select value={tier} onChange={(e) => onTierChange(e.target.value as MarketplaceTierFilter)}>
          {MARKETPLACE_TIER_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={tierOptionDisabled(opt.value, productKind)}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="marketplace-catalog-control">
        <span className="marketplace-catalog-control-label">Category</span>
        <select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.label}</option>
          ))}
        </select>
      </label>
      <label className="marketplace-catalog-control">
        <span className="marketplace-catalog-control-label">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value as MarketplaceCatalogSort)}>
          {MARKETPLACE_CATALOG_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
