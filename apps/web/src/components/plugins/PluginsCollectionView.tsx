import { useEffect, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { marketplaceProduct } from '../../lib/marketplace-products'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  kind: PluginKind
  selectedId: string | null
  onSelect: (pkg: PluginPackage) => void
  sectionTitle?: string
}

function pluginProductScope(kind: PluginKind): 'injectors' | 'rankers' | 'enrichers' {
  if (kind === 'injector') return 'injectors'
  if (kind === 'enricher') return 'enrichers'
  return 'rankers'
}

export function PluginsCollectionView({ kind, selectedId, onSelect, sectionTitle }: Props) {
  const [packages, setPackages] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)
  const product = marketplaceProduct(pluginProductScope(kind))

  useEffect(() => {
    setLoading(true)
    void api
      .listPluginCollection(kind)
      .then((res) => setPackages(res.packages.filter((p) => p.kind === kind)))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [kind])

  return (
    <div className="logic-blocks-collection">
      {sectionTitle ? <h3 className="collection-section-title">{sectionTitle}</h3> : null}
      {loading && <p className="card-hint">Loading {product.label.toLowerCase()}…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No {product.label.toLowerCase()} yet. Use <strong>New custom code</strong> in the sidebar
          (verification required), or open <strong>Plugin developer guide</strong> for contracts.
        </p>
      )}
      <div className="marketplace-catalog-grid">
        {packages.map((pkg) => (
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
            productKind={kind}
            executionTier="custom_code"
            subtitle={pkg.runtime}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
