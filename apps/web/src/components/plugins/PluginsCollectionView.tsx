import { useEffect, useState } from 'react'
import type { PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  selectedId: string | null
  onSelect: (pkg: PluginPackage) => void
}

export function PluginsCollectionView({ selectedId, onSelect }: Props) {
  const [packages, setPackages] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listPluginCollection()
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="logic-blocks-collection">
      {loading && <p className="card-hint">Loading custom code…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          No custom code packages yet. Use <strong>New custom code</strong> in the sidebar (verification
          required), or open <strong>Plugin developer guide</strong> for contracts and the example ranker.
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
                <span className="logic-blocks-catalog-sub">
                  {pkg.kind} · {pkg.runtime} · v{pkg.version}
                </span>
                {pkg.description ? (
                  <span className="logic-blocks-catalog-desc">{pkg.description}</span>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
