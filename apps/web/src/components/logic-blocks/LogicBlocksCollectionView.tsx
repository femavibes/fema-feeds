import { useEffect, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { MarketplaceCatalogCard } from '../marketplace/MarketplaceCatalogCard'

interface Props {
  selectedId: string | null
  onSelect: (pkg: LogicBlockPackage) => void
  onEdit?: (pkg: LogicBlockPackage) => void
}

export function LogicBlocksCollectionView({ selectedId, onSelect }: Props) {
  const [packages, setPackages] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listLogicBlockCollection()
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-blocks-collection">
      {loading && <p className="card-hint">Loading collection…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No blocks yet. Click <strong>New logic block</strong> above or save a group from a feed&apos;s
          visual editor with &quot;Save to my collection&quot;.
        </p>
      )}
      <div className="marketplace-catalog-grid">
        {packages.map((pkg) => (
          <MarketplaceCatalogCard
            key={`${pkg.id}@${pkg.version}`}
            id={pkg.id}
            name={pkg.name}
            description={pkg.description}
            version={pkg.version}
            visibility={pkg.visibility}
            trustTier={pkg.trustTier}
            listing={pkg.listing}
            updatedAt={pkg.updatedAt}
            productKind="logic_block"
            subtitle={pkg.slug}
            selected={selectedId === pkg.id}
            onClick={() => onSelect(pkg)}
          />
        ))}
      </div>
    </div>
  )
}
