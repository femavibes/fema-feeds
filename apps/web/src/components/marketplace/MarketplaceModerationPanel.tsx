import { useCallback, useEffect, useState } from 'react'
import type { LogicBlockPackage, LogicBlockTrustTier, PluginPackage, SortPackPackage } from '@cfb/core-types'
import { api } from '../../api/client'

type ModerationScope = 'deployment' | 'global'
type ProductKind = 'logic_blocks' | 'sort_packs' | 'injectors' | 'rankers'

interface PendingRow {
  kind: ProductKind
  id: string
  name: string
  version: string
  ownerDid: string
  visibility: 'deployment' | 'global'
  trustTier: LogicBlockTrustTier
}

const KIND_LABEL: Record<ProductKind, string> = {
  logic_blocks: 'Logic block',
  sort_packs: 'Sort pack',
  injectors: 'Injector',
  rankers: 'Ranker',
}

function toRows(
  kind: ProductKind,
  packages: Array<LogicBlockPackage | SortPackPackage | PluginPackage>,
  scope: ModerationScope,
): PendingRow[] {
  return packages
    .filter((p) => p.visibility === scope && p.trustTier === 'none')
    .map((p) => ({
      kind,
      id: p.id,
      name: p.name,
      version: p.version,
      ownerDid: p.ownerDid,
      visibility: p.visibility as 'deployment' | 'global',
      trustTier: p.trustTier,
    }))
}

interface Props {
  isMaster: boolean
  isGlobalVerifier: boolean
  registryRole: 'operator' | 'consumer' | 'embedded' | null
  onChanged?: () => void
}

export function MarketplaceModerationPanel({
  isMaster,
  isGlobalVerifier,
  registryRole,
  onChanged,
}: Props) {
  const canModerateDeployment = isMaster
  const canModerateGlobal =
    isGlobalVerifier && (registryRole === 'operator' || registryRole === 'embedded')

  const [scope, setScope] = useState<ModerationScope>(
    canModerateDeployment ? 'deployment' : 'global',
  )
  const [rows, setRows] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (scope === 'deployment' && !canModerateDeployment) return
    if (scope === 'global' && !canModerateGlobal) return
    setLoading(true)
    setError(null)
    try {
      const catalogScope = scope
      const [logic, sort, injectors, rankers] = await Promise.all([
        api.listLogicBlockCatalog(catalogScope),
        api.listSortPackCatalog(catalogScope),
        api.listPluginCatalog('injector', catalogScope),
        api.listPluginCatalog('ranker', catalogScope),
      ])
      setRows([
        ...toRows('logic_blocks', logic.packages, scope),
        ...toRows('sort_packs', sort.packages, scope),
        ...toRows('injectors', injectors.packages, scope),
        ...toRows('rankers', rankers.packages, scope),
      ])
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Failed to load moderation queue')
    } finally {
      setLoading(false)
    }
  }, [scope, canModerateDeployment, canModerateGlobal])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async (row: PendingRow) => {
    const trustTier: LogicBlockTrustTier =
      scope === 'global' ? 'global_verified' : 'deployment_verified'
    setBusyId(row.id)
    setError(null)
    try {
      if (row.kind === 'logic_blocks') {
        await api.verifyLogicBlockPublisher(row.id, trustTier)
      } else if (row.kind === 'sort_packs') {
        await api.verifySortPackTrust(row.id, trustTier)
      } else {
        await api.verifyPluginTrust(row.id, trustTier)
      }
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!canModerateDeployment && !canModerateGlobal) return null

  return (
    <section className="marketplace-moderation card">
      <p className="card-hint">
        Listings published to the catalog without a verification badge. Approve to show the
        verified seal in Browse.
      </p>

      {(canModerateDeployment && canModerateGlobal) || (canModerateDeployment && !canModerateGlobal) ? (
        <div className="logic-blocks-browse-scope" role="tablist" aria-label="Moderation scope">
          {canModerateDeployment ? (
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'deployment'}
              className={`logic-blocks-scope-btn${scope === 'deployment' ? ' active' : ''}`}
              onClick={() => setScope('deployment')}
            >
              This deployment
            </button>
          ) : null}
          {canModerateGlobal ? (
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'global'}
              className={`logic-blocks-scope-btn${scope === 'global' ? ' active' : ''}`}
              onClick={() => setScope('global')}
            >
              Global marketplace
            </button>
          ) : null}
        </div>
      ) : null}

      {scope === 'global' && registryRole === 'consumer' ? (
        <p className="field-error">
          Global moderation runs on the operator registry host, not consumer deployments.
        </p>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}
      {loading ? <p className="card-hint">Loading queue…</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="card-hint">No unverified listings in this catalog.</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="marketplace-moderation-list">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`} className="marketplace-moderation-row">
              <div className="marketplace-moderation-row-main">
                <span className="badge badge-muted">{KIND_LABEL[row.kind]}</span>
                <strong>{row.name}</strong>
                <span className="card-hint">v{row.version}</span>
              </div>
              <p className="card-hint mono marketplace-moderation-owner">{row.ownerDid}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busyId === row.id}
                onClick={() => void approve(row)}
              >
                {busyId === row.id ? 'Approving…' : 'Approve listing'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
