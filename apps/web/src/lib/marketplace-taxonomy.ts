import { api } from '../api/client'

export interface TaxonomyEntry {
  id: string
  label: string
  scope: string
}

export interface MarketplaceTaxonomy {
  categories: TaxonomyEntry[]
  tags: TaxonomyEntry[]
}

let cached: MarketplaceTaxonomy | null = null
let fetching: Promise<MarketplaceTaxonomy> | null = null

export async function getMarketplaceTaxonomy(): Promise<MarketplaceTaxonomy> {
  if (cached) return cached
  if (fetching) return fetching
  fetching = api.marketplaceTaxonomy().then((t) => {
    cached = t
    fetching = null
    return t
  }).catch(() => {
    fetching = null
    return { categories: [], tags: [] }
  })
  return fetching
}

export function getCachedTaxonomy(): MarketplaceTaxonomy | null {
  return cached
}

export function invalidateTaxonomyCache(): void {
  cached = null
}
