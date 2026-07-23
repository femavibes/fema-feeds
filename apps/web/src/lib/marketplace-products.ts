export type MarketplaceBrowseKind = 'logic_blocks' | 'sort_packs' | 'rankers' | 'injectors' | 'enrichers'

export type MarketplaceProductTier = 'native' | 'custom_code'

export interface MarketplaceProductDef {
  id: MarketplaceBrowseKind
  label: string
  /** Default tier badge when a single tier applies */
  tier: MarketplaceProductTier
  supportsNative: boolean
  supportsCustomCode: boolean
  /** One-line purpose for headers and empty states */
  summary: string
  /** Where it plugs into the feed pipeline */
  runsAt: string
  /** What data / APIs it can touch */
  access: string
  collectionHint: string
  browseHint: string
}

/** Pipeline order: pool → sort → personalize → inject → enrich */
export const MARKETPLACE_PRODUCTS: Record<MarketplaceBrowseKind, MarketplaceProductDef> = {
  logic_blocks: {
    id: 'logic_blocks',
    label: 'Logic blocks',
    tier: 'native',
    supportsNative: true,
    supportsCustomCode: false,
    summary: 'Reusable L2 rule groups for the feed visual editor.',
    runsAt: 'Candidate pool — wired as nodes in the L2 graph (include / exclude / score).',
    access: 'Post fields, labels, rank snapshot, and other native L2 operands only. No arbitrary code.',
    collectionHint:
      'Build and test logic here, then publish to your deployment or submit to the global marketplace.',
    browseHint:
      'Subscribe to reuse published rule groups in your feed visual editor. Native JSON — no verification required to create.',
  },
  sort_packs: {
    id: 'sort_packs',
    label: 'Sorting formulas',
    tier: 'native',
    supportsNative: true,
    supportsCustomCode: true,
    summary: 'Formulas that rank the candidate pool before skeleton pages are built.',
    runsAt: 'Pool build — sets the primary sort key before skeleton pages are cut.',
    access:
      'Native L2 expressions over post metadata, or custom code (WASM / remote) when published. Edited in the UI or saved from a feed Sorting tab.',
    collectionHint:
      'Save sorting formulas from a feed Sorting tab or compose here, then publish when ready.',
    browseHint:
      'Subscribe and apply on any feed\'s Sorting tab. Use the tier filter for native formulas vs custom code packages.',
  },
  rankers: {
    id: 'rankers',
    label: 'Personalization formulas',
    tier: 'custom_code',
    supportsNative: true,
    supportsCustomCode: true,
    summary: 'Reorder the top of each skeleton page per viewer at serve time.',
    runsAt: 'Serve time — after DB sort, before injectors.',
    access:
      'Native L2 formulas over viewer signals, or custom code rankers (WASM / remote). Custom code requires publisher verification to create.',
    collectionHint:
      'Save native formulas from a feed Personalization tab, or upload custom code plugins when verified. Publish when ready.',
    browseHint:
      'Subscribe and apply on a feed\'s Personalization tab. Filter by native formulas vs custom code plugins.',
  },
  injectors: {
    id: 'injectors',
    label: 'Injectors',
    tier: 'custom_code',
    supportsNative: false,
    supportsCustomCode: true,
    summary: 'Insert posts into skeleton pages after ranking and personalization.',
    runsAt: 'Serve time — after sort + personalization, on each skeleton page (`onInject`).',
    access:
      'Publisher-uploaded WASM, worker, or remote HTTP. Verification required to create.',
    collectionHint:
      'Verified publishers only. Upload WASM or configure remote endpoints, then publish like any listing.',
    browseHint:
      'Subscribe and wire slots on a feed\'s Sorting tab. Custom code only — WASM or remote.',
  },
  enrichers: {
    id: 'enrichers',
    label: 'Enrichers',
    tier: 'custom_code',
    supportsNative: false,
    supportsCustomCode: true,
    summary: 'Augment posts with additional data (ML tags, video analysis, etc.).',
    runsAt: 'After ingest or background sweep — writes enrichment data to posts.',
    access:
      'Publisher-uploaded WASM, worker, or remote HTTP. Verification required to create. Custom code only.',
    collectionHint:
      'Verified publishers only. Enrichers write data that logic blocks and formulas can read.',
    browseHint:
      'Subscribe to add enrichment fields to your pool posts. Custom code only — WASM or remote.',
  },
}

export const MARKETPLACE_NATIVE_KINDS: MarketplaceBrowseKind[] = ['logic_blocks', 'sort_packs']

export const MARKETPLACE_CUSTOM_CODE_KINDS: MarketplaceBrowseKind[] = ['rankers', 'injectors', 'enrichers']

export function marketplaceProduct(kind: MarketplaceBrowseKind): MarketplaceProductDef {
  return MARKETPLACE_PRODUCTS[kind]
}

export function isCustomCodeProduct(kind: MarketplaceBrowseKind): boolean {
  return MARKETPLACE_PRODUCTS[kind].supportsCustomCode
}

/** Products where creation is custom-code only (injectors, enrichers, etc.). */
export function isCustomCodeOnlyProduct(kind: MarketplaceBrowseKind): boolean {
  const product = MARKETPLACE_PRODUCTS[kind]
  return product.supportsCustomCode && !product.supportsNative
}

export function productTierBadgeLabel(product: MarketplaceProductDef): string {
  if (product.supportsNative && product.supportsCustomCode) return 'Native · Custom code'
  if (product.supportsNative) return 'Native'
  return 'Custom code'
}
