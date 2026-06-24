import { useEffect, useState } from 'react'
import type { PluginKind, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockTrustBadge } from '../logic-blocks/logic-block-labels'

export type BrowseCatalogScope = 'deployment' | 'global'

interface Props {
  kind?: PluginKind
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: PluginPackage) => void
}

const KIND_HINT: Record<PluginKind, { intro: string; emptyDeployment: string; emptyGlobal: string }> = {
  injector: {
    intro: 'Post-sort injectors for ads and promos. Subscribe here, then wire slots on a feed\'s Sorting tab.',
    emptyDeployment: 'No deployment injectors yet. Operator instances seed a demo static-URI injector.',
    emptyGlobal: 'No global injectors yet.',
  },
  ranker: {
    intro: 'Custom rankers reorder skeleton pages at serve time. Subscribe here, then apply on a feed\'s Sorting tab.',
    emptyDeployment: 'No deployment rankers yet. Operator instances seed a demo pinned-URI ranker.',
    emptyGlobal: 'No global rankers yet.',
  },
}

export function InjectorsBrowseView({ kind = 'injector', selectedId, subscribedIds, onSelect }: Props) {
  const [scope, setScope] = useState<BrowseCatalogScope>('deployment')
  const [packages, setPackages] = useState<PluginPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void api
      .listPluginCatalog(kind, scope)
      .then((res) => setPackages(res.packages))
      .catch(() => setPackages([]))
      .finally(() => setLoading(false))
  }, [scope, kind])

  const copy = KIND_HINT[kind]

  return (
    <div className="logic-blocks-browse">
      <div className="logic-blocks-browse-scope" role="tablist" aria-label="Catalog scope">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'deployment'}
          className={`logic-blocks-scope-btn${scope === 'deployment' ? ' active' : ''}`}
          onClick={() => setScope('deployment')}
        >
          This deployment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'global'}
          className={`logic-blocks-scope-btn${scope === 'global' ? ' active' : ''}`}
          onClick={() => setScope('global')}
        >
          Global marketplace
        </button>
      </div>

      <p className="card-hint">{copy.intro}</p>

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          {scope === 'deployment' ? copy.emptyDeployment : copy.emptyGlobal}
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
                  v{pkg.version} · {pkg.runtime}
                  {subscribedIds.has(pkg.id) ? ' · Subscribed' : ''}
                </span>
                {pkg.description ? (
                  <span className="logic-blocks-catalog-desc">{pkg.description}</span>
                ) : null}
              </div>
              <LogicBlockTrustBadge tier={pkg.trustTier} visibility={pkg.visibility} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
