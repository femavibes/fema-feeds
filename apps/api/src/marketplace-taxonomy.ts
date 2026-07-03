import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import { globalMarketplaceRemoteUrl, globalMarketplaceRegistryRole } from './global-marketplace.js'

export interface TaxonomyEntry {
  id: string
  label: string
  scope: 'global' | 'local'
}

export interface MarketplaceTaxonomy {
  categories: TaxonomyEntry[]
  tags: TaxonomyEntry[]
}

const root = resolve(import.meta.dirname, '../../..')
const TAXONOMY_PATH = resolve(root, 'config/marketplace-taxonomy.json')

let cached: MarketplaceTaxonomy | null = null

export async function loadTaxonomy(): Promise<MarketplaceTaxonomy> {
  if (cached) return cached
  try {
    const raw = await readFile(TAXONOMY_PATH, 'utf8')
    cached = JSON.parse(raw) as MarketplaceTaxonomy
    return cached
  } catch {
    cached = { categories: [], tags: [] }
    return cached
  }
}

export function invalidateTaxonomyCache(): void {
  cached = null
}

async function syncTaxonomyFromGlobal(): Promise<MarketplaceTaxonomy | null> {
  const role = globalMarketplaceRegistryRole()
  if (role === 'registry') return null // we ARE the registry
  const remoteUrl = globalMarketplaceRemoteUrl()
  if (!remoteUrl) return null
  try {
    const res = await fetch(`${remoteUrl}/api/marketplace/taxonomy`)
    if (!res.ok) return null
    const remote = (await res.json()) as MarketplaceTaxonomy
    // Merge: keep local-only entries, replace global entries with remote
    const local = await loadTaxonomy()
    const localOnlyCategories = local.categories.filter((c) => c.scope === 'local')
    const localOnlyTags = local.tags.filter((t) => t.scope === 'local')
    const merged: MarketplaceTaxonomy = {
      categories: [...remote.categories.map((c) => ({ ...c, scope: 'global' as const })), ...localOnlyCategories],
      tags: [...remote.tags.map((t) => ({ ...t, scope: 'global' as const })), ...localOnlyTags],
    }
    await writeFile(TAXONOMY_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8')
    cached = merged
    return merged
  } catch {
    return null
  }
}

export function registerMarketplaceTaxonomyRoutes(app: Hono): void {
  app.get('/api/marketplace/taxonomy', async (c) => {
    const taxonomy = await loadTaxonomy()
    return c.json(taxonomy)
  })

  app.post('/api/marketplace/taxonomy/sync', async (c) => {
    const result = await syncTaxonomyFromGlobal()
    if (!result) return c.json({ error: 'Sync not available or failed' }, 503)
    invalidateTaxonomyCache()
    return c.json(result)
  })
}

// Auto-sync on startup for consumer deployments
const role = globalMarketplaceRegistryRole()
if (role === 'consumer') {
  void syncTaxonomyFromGlobal()
}
