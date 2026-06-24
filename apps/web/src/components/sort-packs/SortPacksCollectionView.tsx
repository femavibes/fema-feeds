import { useEffect, useState } from 'react'
import type { SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  selectedId: string | null
  onSelect: (pkg: SortPackPackage) => void
}

export function SortPacksCollectionView({ selectedId, onSelect }: Props) {
  const [packages, setPackages] = useState<SortPackPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listSortPackCollection()
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-blocks-collection">
      {loading && <p className="card-hint">Loading sort packs…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No sort packs saved yet. Use <strong>Save sort to collection</strong> on a feed&apos;s Sorting tab.
        </p>
      )}
      <ul className="logic-blocks-catalog-list">
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <button
              type="button"
              className={`logic-blocks-catalog-item${selectedId === pkg.id ? ' is-selected' : ''}`}
              onClick={() => onSelect(pkg)}
            >
              <div className="logic-blocks-catalog-meta">
                <span className="logic-blocks-catalog-name">{pkg.name}</span>
                <span className="logic-blocks-catalog-sub">v{pkg.version}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
