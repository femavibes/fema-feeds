export type MarketplaceBrowseKind = 'logic_blocks' | 'sort_packs' | 'injectors' | 'rankers'

export type MarketplaceProductTier = 'native' | 'custom_code'

export interface MarketplaceProductDef {
  id: MarketplaceBrowseKind
  label: string
  tier: MarketplaceProductTier
  /** One-line purpose for headers and empty states */
  summary: string
  /** Where it plugs into the feed pipeline */
  runsAt: string
  /** What data / APIs it can touch */
  access: string
  collectionHint: string
  browseHint: string
}

export const MARKETPLACE_PRODUCTS: Record<MarketplaceBrowseKind, MarketplaceProductDef> = {
  logic_blocks: {
    id: 'logic_blocks',
    label: 'Logic blocks',
    tier: 'native',
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
    label: 'Sort packs',
    tier: 'native',
    summary: 'Named sort formulas (L2Expr) for feed ranking.',
    runsAt: 'Pool build — sets the primary sort key before skeleton pages are cut.',
    access: 'Native sort expressions over post metadata. Edited in the UI or saved from a feed Sorting tab.',
    collectionHint: 'Save sort presets from a feed or compose here, then publish when ready.',
    browseHint:
      'Subscribe and apply on any feed\'s Sorting tab. Native JSON formulas — same tier as logic blocks.',
  },
  injectors: {
    id: 'injectors',
    label: 'Injectors',
    tier: 'custom_code',
    summary: 'Insert posts into skeleton pages after ranking.',
    runsAt: 'Serve time — after sort + ranker, on each skeleton page (`onInject`).',
    access:
      'Publisher-uploaded WASM, worker, remote HTTP, or native adapters. Verification required to create.',
    collectionHint:
      'Verified publishers only. Upload WASM or configure remote endpoints, then publish like any listing.',
    browseHint:
      'Subscribe and wire slots on a feed\'s Sorting tab. Custom code tier — runs at serve time.',
  },
  rankers: {
    id: 'rankers',
    label: 'Rankers',
    tier: 'custom_code',
    summary: 'Reorder posts within a skeleton page at serve time.',
    runsAt: 'Serve time — after DB sort, before injectors (`onSort`).',
    access:
      'Publisher-uploaded WASM, worker, remote HTTP, or native adapters. Verification required to create.',
    collectionHint:
      'Verified publishers only. See Plugin developer guide for hooks, manifests, and the example ranker.',
    browseHint:
      'Subscribe and pick a ranker on a feed\'s Sorting tab. Custom code tier — reorders pages live.',
  },
}

export const MARKETPLACE_NATIVE_KINDS: MarketplaceBrowseKind[] = ['logic_blocks', 'sort_packs']

export const MARKETPLACE_CUSTOM_CODE_KINDS: MarketplaceBrowseKind[] = ['injectors', 'rankers']

export function marketplaceProduct(kind: MarketplaceBrowseKind): MarketplaceProductDef {
  return MARKETPLACE_PRODUCTS[kind]
}

export function isCustomCodeProduct(kind: MarketplaceBrowseKind): boolean {
  return MARKETPLACE_PRODUCTS[kind].tier === 'custom_code'
}
