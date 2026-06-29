import type { MarketplaceListingKind } from '@cfb/core-types'

const GLYPH_PATH: Record<MarketplaceListingKind, string> = {
  logic_block:
    'M4 6h6v6H4V6zm10 0h6v6h-6V6zM4 16h6v6H4v-6zm10 3.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z',
  sort_pack: 'M7 4v16M12 7l5 5-5 5M4 12h13',
  injector: 'M8 12h8M12 8v8M6 6l12 12',
  ranker: 'M5 18V9m7 9V5m7 13v-7',
  enricher: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
}

interface Props {
  kind: MarketplaceListingKind
  className?: string
}

export function MarketplaceProductGlyph({ kind, className }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={GLYPH_PATH[kind]} />
    </svg>
  )
}
