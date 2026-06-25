export type MarketplaceCatalogScope = 'all' | 'global' | 'deployment'

export type MarketplaceCatalogSort = 'name_asc' | 'name_desc' | 'updated_desc' | 'trust_desc'

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
