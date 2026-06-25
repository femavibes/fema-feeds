import type { MarketplaceCatalogScope, MarketplaceCatalogSort } from '../../lib/marketplace-catalog'
import { MARKETPLACE_CATALOG_SORT_OPTIONS } from '../../lib/marketplace-catalog'
import { MarketplaceScopeToggle } from './MarketplaceScopeIcons'

interface Props {
  scope: MarketplaceCatalogScope
  sort: MarketplaceCatalogSort
  onScopeChange: (scope: MarketplaceCatalogScope) => void
  onSortChange: (sort: MarketplaceCatalogSort) => void
}

export function MarketplaceCatalogControls({
  scope,
  sort,
  onScopeChange,
  onSortChange,
}: Props) {
  return (
    <div className="marketplace-catalog-controls">
      <div className="marketplace-catalog-control">
        <span className="marketplace-catalog-control-label">Catalog</span>
        <MarketplaceScopeToggle value={scope} onChange={onScopeChange} />
      </div>
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
