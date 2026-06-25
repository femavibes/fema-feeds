import { useCallback, useEffect, useState } from 'react'

import type {

  LogicBlockPackage,

  LogicBlockTrustTier,

  MarketplacePublishRequest,

  MarketplaceProductKind,

  PluginPackage,

  SortPackPackage,

} from '@cfb/core-types'

import { api } from '../../api/client'
import { MarketplaceDeploymentIcon, MarketplaceGlobeIcon } from './MarketplaceScopeIcons'



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



const API_KIND: Record<ProductKind, MarketplaceProductKind> = {

  logic_blocks: 'logic_block',

  sort_packs: 'sort_pack',

  injectors: 'plugin',

  rankers: 'plugin',

}



const REQUEST_KIND_LABEL: Record<MarketplaceProductKind, string> = {

  logic_block: 'Logic block',

  sort_pack: 'Sort pack',

  plugin: 'Plugin',

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

  registryRole: 'registry' | 'consumer' | 'embedded' | null

  onChanged?: () => void

}



export function MarketplaceModerationPanel({

  isMaster,

  isGlobalVerifier,

  registryRole,

  onChanged,

}: Props) {

  const canModerateDeployment = isMaster

  const canModerateGlobal = isGlobalVerifier && registryRole === 'registry'



  const [scope, setScope] = useState<ModerationScope>(

    canModerateDeployment ? 'deployment' : 'global',

  )

  const [rows, setRows] = useState<PendingRow[]>([])

  const [requests, setRequests] = useState<MarketplacePublishRequest[]>([])

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

      const [logic, sort, injectors, rankers, publishRequests] = await Promise.all([

        api.listLogicBlockCatalog(catalogScope),

        api.listSortPackCatalog(catalogScope),

        api.listPluginCatalog('injector', catalogScope),

        api.listPluginCatalog('ranker', catalogScope),

        api.listPublishRequests(scope),

      ])

      setRows([

        ...toRows('logic_blocks', logic.packages, scope),

        ...toRows('sort_packs', sort.packages, scope),

        ...toRows('injectors', injectors.packages, scope),

        ...toRows('rankers', rankers.packages, scope),

      ])

      setRequests(publishRequests.requests)

    } catch (e) {

      setRows([])

      setRequests([])

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



  const unpublish = async (row: PendingRow) => {

    setBusyId(`unpublish-${row.id}`)

    setError(null)

    try {

      await api.unpublishMarketplaceListing(API_KIND[row.kind], row.id)

      await load()

      onChanged?.()

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Remove failed')

    } finally {

      setBusyId(null)

    }

  }



  const reviewRequest = async (request: MarketplacePublishRequest, action: 'approve' | 'deny') => {

    setBusyId(`req-${request.id}`)

    setError(null)

    try {

      await api.reviewPublishRequest(request.id, { action })

      await load()

      onChanged?.()

    } catch (e) {

      setError(e instanceof Error ? e.message : 'Review failed')

    } finally {

      setBusyId(null)

    }

  }



  if (!canModerateDeployment && !canModerateGlobal) return null



  return (

    <section className="marketplace-moderation card">

      <p className="card-hint">

        Review publish requests and unverified listings. Approving a request publishes with a

        verified badge; removing a listing returns it to the owner&apos;s collection.

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
              <MarketplaceDeploymentIcon className="marketplace-scope-toggle-icon" />
              <span className="sr-only">This deployment</span>
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
              <MarketplaceGlobeIcon className="marketplace-scope-toggle-icon" />
              <span className="sr-only">Global marketplace</span>
            </button>

          ) : null}

        </div>

      ) : null}



      {scope === 'global' && registryRole !== 'registry' ? (

        <p className="field-error">

          Global moderation runs on marketplace.fema.monster. Feed-builder VPS deployments only

          moderate their local catalog.

        </p>

      ) : null}



      {error ? <p className="field-error">{error}</p> : null}

      {loading ? <p className="card-hint">Loading queue…</p> : null}



      {!loading && requests.length > 0 ? (

        <>

          <h3 className="marketplace-moderation-subhead">Publish requests</h3>

          <ul className="marketplace-moderation-list">

            {requests.map((request) => (

              <li key={request.id} className="marketplace-moderation-row">

                <div className="marketplace-moderation-row-main">

                  <span className="badge badge-muted">{REQUEST_KIND_LABEL[request.productKind]}</span>

                  <strong>{request.packageName ?? request.packageId}</strong>

                  {request.packageVersion ? (

                    <span className="card-hint">v{request.packageVersion}</span>

                  ) : null}

                </div>

                <p className="card-hint mono marketplace-moderation-owner">{request.ownerDid}</p>

                {request.publisherNote ? (

                  <p className="card-hint marketplace-moderation-note">{request.publisherNote}</p>

                ) : null}

                <div className="marketplace-moderation-row-actions">

                  <button

                    type="button"

                    className="btn btn-secondary btn-sm"

                    disabled={busyId === `req-${request.id}`}

                    onClick={() => void reviewRequest(request, 'approve')}

                  >

                    {busyId === `req-${request.id}` ? 'Working…' : 'Approve & publish'}

                  </button>

                  <button

                    type="button"

                    className="btn btn-ghost btn-sm"

                    disabled={busyId === `req-${request.id}`}

                    onClick={() => void reviewRequest(request, 'deny')}

                  >

                    Deny

                  </button>

                </div>

              </li>

            ))}

          </ul>

        </>

      ) : null}



      {!loading && rows.length > 0 ? (

        <>

          <h3 className="marketplace-moderation-subhead">Unverified listings</h3>

          <ul className="marketplace-moderation-list">

            {rows.map((row) => (

              <li key={`${row.kind}-${row.id}`} className="marketplace-moderation-row">

                <div className="marketplace-moderation-row-main">

                  <span className="badge badge-muted">{KIND_LABEL[row.kind]}</span>

                  <strong>{row.name}</strong>

                  <span className="card-hint">v{row.version}</span>

                </div>

                <p className="card-hint mono marketplace-moderation-owner">{row.ownerDid}</p>

                <div className="marketplace-moderation-row-actions">

                  <button

                    type="button"

                    className="btn btn-secondary btn-sm"

                    disabled={busyId === row.id}

                    onClick={() => void approve(row)}

                  >

                    {busyId === row.id ? 'Approving…' : 'Approve listing'}

                  </button>

                  <button

                    type="button"

                    className="btn btn-ghost btn-sm"

                    disabled={busyId === `unpublish-${row.id}`}

                    onClick={() => void unpublish(row)}

                  >

                    {busyId === `unpublish-${row.id}` ? 'Removing…' : 'Remove from catalog'}

                  </button>

                </div>

              </li>

            ))}

          </ul>

        </>

      ) : null}



      {!loading && rows.length === 0 && requests.length === 0 ? (

        <p className="card-hint">No pending reviews in this catalog.</p>

      ) : null}

    </section>

  )

}

