import { useEffect, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { LogicBlockTrustBadge } from './logic-block-labels'

export type BrowseCatalogScope = 'deployment' | 'global'

const REGISTRY_ROLE_HINT: Record<'operator' | 'consumer' | 'embedded', string> = {
  operator:
    'This instance hosts the global marketplace registry. Listings published to global are served from this database.',
  consumer: 'Global listings are loaded from the configured registry URL.',
  embedded:
    'Dev stub: global listings are in this database. Enable CFB_GLOBAL_MARKETPLACE_OPERATOR=true to act as the registry host.',
}

interface Props {
  selectedId: string | null
  subscribedIds: Set<string>
  onSelect: (pkg: LogicBlockPackage) => void
}

export function LogicBlocksBrowseView({ selectedId, subscribedIds, onSelect }: Props) {
  const [scope, setScope] = useState<BrowseCatalogScope>('deployment')
  const [packages, setPackages] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [marketplaceHint, setMarketplaceHint] = useState<string | null>(null)
  const [registryRole, setRegistryRole] = useState<'operator' | 'consumer' | 'embedded' | null>(
    null,
  )

  const load = () => {
    setLoading(true)
    void Promise.all([
      api.listLogicBlockCatalog(scope),
      scope === 'global' ? api.globalMarketplaceStatus() : Promise.resolve(null),
    ])
      .then(([catalogRes, statusRes]) => {
        setPackages(catalogRes.packages)
        if (scope === 'global' && statusRes) {
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
  }

  useEffect(() => {
    load()
  }, [scope])

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

      <p className="card-hint">
        {scope === 'deployment'
          ? 'Published on this instance. Deployment owners can verify publishers for this deployment only.'
          : registryRole
            ? REGISTRY_ROLE_HINT[registryRole]
            : 'Global marketplace listings. Verification badges are issued by the platform operator (fema.monster), not this deployment.'}
      </p>

      {marketplaceHint ? (
        <p className="settings-hint logic-blocks-global-hint">{marketplaceHint}</p>
      ) : null}

      {loading && <p className="card-hint">Loading catalog…</p>}
      {!loading && packages.length === 0 && (
        <p className="card-hint">
          {scope === 'deployment'
            ? 'No deployment listings yet. Save logic in My collection, then publish to this deployment.'
            : 'No global listings in the catalog yet. Submit blocks from My collection to the global marketplace.'}
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
                  v{pkg.version}
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
