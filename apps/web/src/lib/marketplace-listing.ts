import type { CSSProperties } from 'react'
import type { MarketplaceListingMeta, MarketplaceListingKind } from '@cfb/core-types'

const PALETTES: [string, string][] = [
  ['#5b6ee1', '#8b5cf6'],
  ['#0ea5e9', '#6366f1'],
  ['#14b8a6', '#3b82f6'],
  ['#f59e0b', '#ef4444'],
  ['#ec4899', '#8b5cf6'],
  ['#22c55e', '#0d9488'],
  ['#64748b', '#334155'],
  ['#a855f7', '#db2777'],
]

const TAGLINES: Record<MarketplaceListingKind, string> = {
  logic_block: 'Composable logic for the feed visual editor.',
  sort_pack: 'Native sort formula for feed ranking.',
  injector: 'Post-sort injector for promos and custom slots.',
  ranker: 'Custom ranker that reorders feed pages at serve time.',
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function listingPalette(seed: string): { from: string; to: string } {
  const [from, to] = PALETTES[hashSeed(seed) % PALETTES.length]!
  return { from, to }
}

export function listingGradientStyle(seed: string): CSSProperties {
  const { from, to } = listingPalette(seed)
  return {
    background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  }
}

export interface ListingPresentation {
  iconUrl?: string
  coverUrl?: string
  productImageUrl?: string
  ratingAverage?: number
  ratingCount?: number
  hasRatings: boolean
  description: string
  paletteSeed: string
}

export function resolveListingPresentation(input: {
  id: string
  name: string
  description?: string
  listing?: MarketplaceListingMeta
  productKind: MarketplaceListingKind
}): ListingPresentation {
  const listing = input.listing
  const ratingCount = listing?.ratingCount ?? 0
  const hasRatings = ratingCount > 0 && listing?.ratingAverage != null

  return {
    iconUrl: listing?.iconUrl,
    coverUrl: listing?.coverUrl,
    productImageUrl: listing?.productImageUrl,
    ratingAverage: hasRatings ? listing!.ratingAverage : undefined,
    ratingCount: hasRatings ? ratingCount : undefined,
    hasRatings,
    description: input.description?.trim() || TAGLINES[input.productKind],
    paletteSeed: input.id || input.name,
  }
}

export function formatUpdatedLabel(updatedAt?: string): string | null {
  if (!updatedAt) return null
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return null
  const diffMs = Date.now() - date.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Updated today'
  if (days === 1) return 'Updated yesterday'
  if (days < 14) return `Updated ${days}d ago`
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}
