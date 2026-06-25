import type { MouseEvent } from 'react'
import type { MarketplaceProductScope } from '../../lib/workspace-views'
import {
  MARKETPLACE_CUSTOM_CODE_KINDS,
  MARKETPLACE_NATIVE_KINDS,
  marketplaceProduct,
} from '../../lib/marketplace-products'

interface Props {
  activeKind: MarketplaceProductScope
  overviewLabel: string
  onSelect: (kind: MarketplaceProductScope) => void
  ariaLabel: string
}

export function MarketplaceProductNavList({ activeKind, overviewLabel, onSelect, ariaLabel }: Props) {
  const select = (kind: MarketplaceProductScope) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(kind)
  }

  return (
    <ul className="workspace-nav-nested" aria-label={ariaLabel}>
      <li>
        <button
          type="button"
          className={`workspace-nav-nested-item workspace-nav-nested-item--overview${activeKind === 'all' ? ' active' : ''}`}
          aria-current={activeKind === 'all' ? 'page' : undefined}
          onClick={select('all')}
        >
          {overviewLabel}
        </button>
      </li>
      {MARKETPLACE_NATIVE_KINDS.map((id) => {
        const product = marketplaceProduct(id)
        return (
          <li key={id}>
            <button
              type="button"
              className={`workspace-nav-nested-item${activeKind === id ? ' active' : ''}`}
              aria-current={activeKind === id ? 'page' : undefined}
              onClick={select(id)}
            >
              {product.label}
            </button>
          </li>
        )
      })}
      <li className="workspace-nav-nested-group">
        <span className="workspace-nav-nested-heading">Custom code</span>
        <ul className="workspace-nav-nested-sublist">
          {MARKETPLACE_CUSTOM_CODE_KINDS.map((id) => {
            const product = marketplaceProduct(id)
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`workspace-nav-nested-item${activeKind === id ? ' active' : ''}`}
                  aria-current={activeKind === id ? 'page' : undefined}
                  onClick={select(id)}
                >
                  {product.label}
                </button>
              </li>
            )
          })}
        </ul>
      </li>
    </ul>
  )
}
