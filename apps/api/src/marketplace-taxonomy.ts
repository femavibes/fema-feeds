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

const DEFAULT_CATEGORIES: TaxonomyEntry[] = [
  { id: 'content-filters', label: 'Content Filters', scope: 'global' },
  { id: 'author-curation', label: 'Author Curation', scope: 'global' },
  { id: 'engagement', label: 'Engagement', scope: 'global' },
  { id: 'time-freshness', label: 'Time & Freshness', scope: 'global' },
  { id: 'topic-niche', label: 'Topic & Niche', scope: 'global' },
  { id: 'safety-moderation', label: 'Safety & Moderation', scope: 'global' },
  { id: 'sorting-ranking', label: 'Sorting & Ranking', scope: 'global' },
  { id: 'personalization', label: 'Personalization', scope: 'global' },
  { id: 'injection', label: 'Injection', scope: 'global' },
  { id: 'utility', label: 'Utility', scope: 'global' },
]

const DEFAULT_TAGS: TaxonomyEntry[] = [
  { id: 'keyword', label: 'Keyword', scope: 'global' },
  { id: 'language', label: 'Language', scope: 'global' },
  { id: 'media-type', label: 'Media Type', scope: 'global' },
  { id: 'images', label: 'Images', scope: 'global' },
  { id: 'video', label: 'Video', scope: 'global' },
  { id: 'links', label: 'Links', scope: 'global' },
  { id: 'hashtags', label: 'Hashtags', scope: 'global' },
  { id: 'mentions', label: 'Mentions', scope: 'global' },
  { id: 'lists', label: 'Lists', scope: 'global' },
  { id: 'follows', label: 'Follows', scope: 'global' },
  { id: 'reputation', label: 'Reputation', scope: 'global' },
  { id: 'likes', label: 'Likes', scope: 'global' },
  { id: 'reposts', label: 'Reposts', scope: 'global' },
  { id: 'replies', label: 'Replies', scope: 'global' },
  { id: 'quotes', label: 'Quotes', scope: 'global' },
  { id: 'threads', label: 'Threads', scope: 'global' },
  { id: 'recency', label: 'Recency', scope: 'global' },
  { id: 'decay', label: 'Decay', scope: 'global' },
  { id: 'viral', label: 'Viral', scope: 'global' },
  { id: 'labels', label: 'Labels', scope: 'global' },
  { id: 'nsfw', label: 'NSFW', scope: 'global' },
  { id: 'spam', label: 'Spam', scope: 'global' },
  { id: 'bot-filter', label: 'Bot Filter', scope: 'global' },
  { id: 'score-formula', label: 'Score Formula', scope: 'global' },
  { id: 'weighted', label: 'Weighted', scope: 'global' },
  { id: 'viewer-aware', label: 'Viewer-Aware', scope: 'global' },
  { id: 'follow-graph', label: 'Follow Graph', scope: 'global' },
  { id: 'ads', label: 'Ads', scope: 'global' },
  { id: 'pinned', label: 'Pinned', scope: 'global' },
  { id: 'promoted', label: 'Promoted', scope: 'global' },
  { id: 'starter-pack', label: 'Starter Pack', scope: 'global' },
  { id: 'community', label: 'Community', scope: 'global' },
  { id: 'art', label: 'Art', scope: 'global' },
  { id: 'news', label: 'News', scope: 'global' },
  { id: 'science', label: 'Science', scope: 'global' },
  { id: 'tech', label: 'Tech', scope: 'global' },
  { id: 'politics', label: 'Politics', scope: 'global' },
  { id: 'sports', label: 'Sports', scope: 'global' },
  { id: 'gaming', label: 'Gaming', scope: 'global' },
  { id: 'music', label: 'Music', scope: 'global' },
]

let cached: MarketplaceTaxonomy | null = null

export async function loadTaxonomy(): Promise<MarketplaceTaxonomy> {
  if (cached) return cached
  try {
    const raw = await readFile(TAXONOMY_PATH, 'utf8')
    const parsed = JSON.parse(raw) as MarketplaceTaxonomy
    // Seed defaults if file exists but is missing the standard entries
    if (parsed.categories.length < DEFAULT_CATEGORIES.length) {
      const existingCatIds = new Set(parsed.categories.map((c) => c.id))
      const missing = DEFAULT_CATEGORIES.filter((c) => !existingCatIds.has(c.id))
      if (missing.length) parsed.categories = [...missing, ...parsed.categories]
    }
    if (parsed.tags.length < DEFAULT_TAGS.length) {
      const existingTagIds = new Set(parsed.tags.map((t) => t.id))
      const missing = DEFAULT_TAGS.filter((t) => !existingTagIds.has(t.id))
      if (missing.length) parsed.tags = [...missing, ...parsed.tags]
    }
    cached = parsed
    return cached
  } catch {
    cached = { categories: [...DEFAULT_CATEGORIES], tags: [...DEFAULT_TAGS] }
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
  // Auto-sync on startup + periodic timer for consumer deployments
  const role = globalMarketplaceRegistryRole()
  if (role === 'consumer') {
    void syncTaxonomyFromGlobal()
    const intervalMs = 6 * 60 * 60 * 1000 // 6 hours
    setInterval(() => void syncTaxonomyFromGlobal(), intervalMs)
  }

  app.get('/api/marketplace/taxonomy', async (c) => {
    const taxonomy = await loadTaxonomy()
    return c.json({ ...taxonomy, registryRole: globalMarketplaceRegistryRole() })
  })

  app.put('/api/marketplace/taxonomy', async (c) => {
    const body = await c.req.json<MarketplaceTaxonomy>()
    if (!body.categories || !body.tags) return c.json({ error: 'categories and tags required' }, 400)
    const taxonomy: MarketplaceTaxonomy = {
      categories: body.categories.map((c) => ({ id: c.id, label: c.label, scope: c.scope })),
      tags: body.tags.map((t) => ({ id: t.id, label: t.label, scope: t.scope })),
    }
    await writeFile(TAXONOMY_PATH, JSON.stringify(taxonomy, null, 2) + '\n', 'utf8')
    cached = taxonomy
    return c.json(taxonomy)
  })

  app.post('/api/marketplace/taxonomy/sync', async (c) => {
    const result = await syncTaxonomyFromGlobal()
    if (!result) return c.json({ error: 'Sync not available or failed' }, 503)
    invalidateTaxonomyCache()
    return c.json(result)
  })
}
