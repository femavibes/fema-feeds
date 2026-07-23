import type { SortPackPackage } from '@cfb/core-types'

import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  packages: SortPackPackage[]
  previewPackageId?: string | null
  appliedPackageId?: string | null
  subscribed?: boolean
  onPreview: (pkg: SortPackPackage) => void
}

export function FeedFormulaPackGrid({
  packages,
  previewPackageId,
  appliedPackageId,
  subscribed = false,
  onPreview,
}: Props) {
  if (packages.length === 0) return null

  return (
    <div className="marketplace-catalog-grid feed-formula-pack-grid">
      {packages.map((pkg) => {
        const inUse = appliedPackageId === pkg.id
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
            selected={previewPackageId === pkg.id}
            subtitle={inUse ? 'In use on this feed' : undefined}
            onClick={() => onPreview(pkg)}
          />
        )
      })}
    </div>
  )
}
