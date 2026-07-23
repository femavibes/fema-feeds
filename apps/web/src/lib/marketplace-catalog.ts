export type MarketplaceCatalogScope = 'all' | 'global' | 'deployment'

export type MarketplaceCatalogSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'trust_desc'

export type MarketplaceCategoryFilter = string | 'all'

export type MarketplaceTierFilter = 'all' | 'native' | 'custom_code'

export const MARKETPLACE_TIER_FILTER_OPTIONS: {
  value: MarketplaceTierFilter
  label: string
}[] = [
  { value: 'all', label: 'All tiers' },
  { value: 'native', label: 'Native' },
  { value: 'custom_code', label: 'Custom code' },
]

export function filterByTier<T>(
  items: T[],
  tier: MarketplaceTierFilter,
  resolveTier: (item: T) => 'native' | 'custom_code',
): T[] {
  if (tier === 'all') return items
  return items.filter((item) => resolveTier(item) === tier)
}

export const MARKETPLACE_CATALOG_SCOPE_OPTIONS: {
  value: MarketplaceCatalogScope
  label: string
}[] = [
  { value: 'all', label: 'All catalogs' },
  { value: 'global', label: 'Global marketplace' },
  { value: 'deployment', label: 'This deployment' },
]

export const MARKETPLACE_CATALOG_SORT_OPTIONS: {
  value: MarketplaceCatalogSort
  label: string
}[] = [
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'trust_desc', label: 'Verified first' },
]

type SortablePackage = {
  name: string
  updatedAt: string
  trustTier: string
}

export function sortMarketplacePackages<T extends SortablePackage>(
  packages: T[],
  sort: MarketplaceCatalogSort,
): T[] {
  const copy = [...packages]
  const trustScore = (tier: string) =>
    tier === 'global_verified' ? 3 : tier === 'deployment_verified' ? 2 : 0

  copy.sort((a, b) => {
    switch (sort) {
      case 'name_asc':
        return a.name.localeCompare(b.name)
      case 'name_desc':
        return b.name.localeCompare(a.name)
      case 'updated_desc':
        return b.updatedAt.localeCompare(a.updatedAt)
      case 'trust_desc':
        return trustScore(b.trustTier) - trustScore(a.trustTier) || a.name.localeCompare(b.name)
      default:
        return 0
    }
  })
  return copy
}

export function filterByCategory<T>(
  packages: T[],
  category: MarketplaceCategoryFilter,
): T[] {
  if (category === 'all') return packages
  return packages.filter((p) => (p as any).listing?.category === category)
}
