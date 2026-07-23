import type { L2Expr, SortPackPackage } from '@cfb/core-types'

import { personalizationFormulasMatch } from '../../lib/feed-personalization'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  packages: SortPackPackage[]
  selectedPackageId?: string | null
  matchFormula?: L2Expr
  subscribed?: boolean
  onSelect: (pkg: SortPackPackage) => void
}

export function FeedFormulaPackGrid({
  packages,
  selectedPackageId,
  matchFormula,
  subscribed = false,
  onSelect,
}: Props) {
  if (packages.length === 0) return null

  return (
    <div className="marketplace-catalog-grid feed-formula-pack-grid">
      {packages.map((pkg) => {
        const selected =
          selectedPackageId === pkg.id ||
          (!selectedPackageId && matchFormula != null && personalizationFormulasMatch(matchFormula, pkg.sortKey))

        return (
          <MarketplaceCatalogCard
            key={pkg.id}
            id={pkg.id}
            name={pkg.name}
            description={pkg.description}
            version={pkg.version}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={pkg.listing}
            updatedAt={pkg.updatedAt}
            productKind="sort_pack"
            ownerDid={pkg.ownerDid}
            executionTier="native"
            subscribed={subscribed}
            selected={selected}
            onClick={() => onSelect(pkg)}
          />
        )
      })}
    </div>
  )
}
