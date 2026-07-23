import type { PluginPackage } from '@cfb/core-types'

import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  packages: PluginPackage[]
  versionPins: Map<string, string>
  productKind: 'ranker' | 'injector' | 'enricher'
  selectedPackageId?: string | null
  subscribed?: boolean
  onSelect: (pkg: PluginPackage, versionPin: string) => void
}

export function FeedPluginPackGrid({
  packages,
  versionPins,
  productKind,
  selectedPackageId,
  subscribed = false,
  onSelect,
}: Props) {
  if (packages.length === 0) return null

  return (
    <div className="marketplace-catalog-grid feed-formula-pack-grid">
      {packages.map((pkg) => {
        const versionPin = versionPins.get(pkg.id) ?? pkg.version
        return (
          <MarketplaceCatalogCard
            key={pkg.id}
            id={pkg.id}
            name={pkg.name}
            description={pkg.description}
            version={versionPin}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={pkg.listing}
            updatedAt={pkg.updatedAt}
            productKind={productKind}
            ownerDid={pkg.ownerDid}
            executionTier="custom_code"
            subtitle={pkg.runtime}
            subscribed={subscribed}
            selected={selectedPackageId === pkg.id}
            onClick={() => onSelect(pkg, versionPin)}
          />
        )
      })}
    </div>
  )
}
