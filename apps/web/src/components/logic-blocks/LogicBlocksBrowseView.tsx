import { useEffect, useMemo, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort } from '../../lib/marketplace-catalog'
import { sortMarketplacePackages } from '../../lib/marketplace-catalog'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

const REGISTRY_ROLE_HINT: Record<'registry' | 'consumer' | 'embedded', string> = {
  registry:
    'This host is the global marketplace registry. Global listings are managed here by fema.monster.',
  consumer: 'Global listings are loaded from marketplace.fema.monster.',
  embedded:
    'Offline dev stub. Unset CFB_GLOBAL_MARKETPLACE_EMBEDDED to use the live global registry.',
}

const SCOPE_HINT: Record<MarketplaceCatalogScope, string> = {
  all: 'Listings from this deployment and the global marketplace. Use the Catalog filter to narrow results.',
  deployment:
    'Published on this instance. Deployment owners can verify publishers for this deployment only.',
  global:
    'Global marketplace listings. Verification badges are issued by the platform operator (fema.monster), not this deployment.',
}

const EMPTY_HINT: Record<MarketplaceCatalogScope, string> = {
  all: 'No listings yet. Publish from My collection or browse the global marketplace when items are available.',
  deployment:
    'No deployment listings yet. Save logic in My collection, then publish to this deployment.',
  global: 'No global listings in the catalog yet. Submit blocks from My collection to the global marketplace.',
}

interface Props {
  catalogScope: MarketplaceCatalogScope
  catalogSort: MarketplaceCatalogSort
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: LogicBlockPackage) => void
}

export function LogicBlocksBrowseView({
  catalogScope,
  catalogSort,
  selectedId,
  subscribedIds,
  onSelect,
}: Props) {
  const [packages, setPackages] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [marketplaceHint, setMarketplaceHint] = useState<string | null>(null)
  const [registryRole, setRegistryRole] = useState<'registry' | 'consumer' | 'embedded' | null>(
    null,
  )

  const sortedPackages = useMemo(
    () => sortMarketplacePackages(packages, catalogSort),
    [packages, catalogSort],
  )

  useEffect(() => {
    setLoading(true)
    const needsGlobalStatus = catalogScope !== 'deployment'
    void Promise.all([
      api.listLogicBlockCatalog(catalogScope),
      needsGlobalStatus ? api.globalMarketplaceStatus() : Promise.resolve(null),
    ])
      .then(([catalogRes, statusRes]) => {
        setPackages(catalogRes.packages)
        if (needsGlobalStatus && statusRes) {
          setRegistryRole(statusRes.registryRole)
          setMarketplaceHint(statusRes.hint)
        } else {
          setRegistryRole(null)
          setMarketplaceHint(null)
        }
      })
      .catch(() => {
        setPackages([])
        setMarketplaceHint(null)
      })
      .finally(() => setLoading(false))
  }, [catalogScope])

  const scopeHint =
    catalogScope === 'global' && registryRole
      ? REGISTRY_ROLE_HINT[registryRole]
      : SCOPE_HINT[catalogScope]

  return (
    <div className="logic-blocks-browse">
      <p className="card-hint">{scopeHint}</p>

      {marketplaceHint && catalogScope !== 'deployment' ? (
        <p className="settings-hint logic-blocks-global-hint">{marketplaceHint}</p>
      ) : null}

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && sortedPackages.length === 0 && (
        <p className="card-hint">{EMPTY_HINT[catalogScope]}</p>
      )}
      <div className="marketplace-catalog-grid">
        {sortedPackages.map((pkg) => (
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
            productKind="logic_block"
            ownerDid={pkg.ownerDid}
            subscribed={subscribedIds.has(pkg.id)}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
