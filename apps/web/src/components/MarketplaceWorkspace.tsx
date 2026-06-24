import { useCallback, useEffect, useState } from 'react'

import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import type { MarketplaceWorkspaceView } from '../lib/workspace-views'



import { api } from '../api/client'

import { WorkspaceNav } from './WorkspaceNav'

import { LogicBlockDetailPanel } from './logic-blocks/LogicBlockDetailPanel'

import { LogicBlocksBrowseView } from './logic-blocks/LogicBlocksBrowseView'

import { LogicBlocksInstalledView } from './logic-blocks/LogicBlocksInstalledView'

import { PublisherVerifyPanel } from './logic-blocks/PublisherVerifyPanel'
import { MarketplaceModerationPanel } from './marketplace/MarketplaceModerationPanel'

import { SortPackDetailPanel } from './sort-packs/SortPackDetailPanel'

import { SortPacksBrowseView } from './sort-packs/SortPacksBrowseView'

import { SortPacksInstalledView } from './sort-packs/SortPacksInstalledView'

import { InjectorDetailPanel } from './plugins/InjectorDetailPanel'

import { InjectorsBrowseView } from './plugins/InjectorsBrowseView'

import { InjectorsInstalledView } from './plugins/InjectorsInstalledView'



export type MarketplaceProductKind = 'logic_blocks' | 'sort_packs' | 'injectors' | 'rankers'



const VIEW_COPY: Record<MarketplaceWorkspaceView, { title: string; hint: string }> = {

  browse: {

    title: 'Browse',

    hint: 'Subscribe to logic blocks, sort packs, injectors, and rankers published on this deployment or the global marketplace.',

  },

  installed: {

    title: 'Subscriptions',

    hint: 'Logic blocks go in the feed visual editor; sort packs, rankers, and injectors go on the feed Sorting tab.',

  },

  verify: {

    title: 'Verify publisher',

    hint: 'Look up a Bluesky handle to verify or revoke publisher status.',

  },

  moderate: {

    title: 'Moderate listings',

    hint: 'Approve unverified catalog listings for this deployment or the global marketplace.',

  },

}



type Selection =

  | { kind: 'logic_block'; pkg: LogicBlockPackage }

  | { kind: 'sort_pack'; pkg: SortPackPackage }

  | { kind: 'injector'; pkg: PluginPackage }

  | { kind: 'ranker'; pkg: PluginPackage }

  | null



export function MarketplaceWorkspace() {

  const [view, setView] = useState<MarketplaceWorkspaceView>('browse')

  const [productKind, setProductKind] = useState<MarketplaceProductKind>('logic_blocks')

  const [selection, setSelection] = useState<Selection>(null)

  const [logicPins, setLogicPins] = useState<Map<string, string>>(new Map())

  const [sortPins, setSortPins] = useState<Map<string, string>>(new Map())

  const [injectorPins, setInjectorPins] = useState<Map<string, string>>(new Map())

  const [rankerPins, setRankerPins] = useState<Map<string, string>>(new Map())

  const [isMaster, setIsMaster] = useState(false)

  const [isGlobalVerifier, setIsGlobalVerifier] = useState(false)

  const [registryRole, setRegistryRole] = useState<'operator' | 'consumer' | 'embedded' | null>(
    null,
  )

  const [refreshKey, setRefreshKey] = useState(0)



  const canVerify = isMaster || isGlobalVerifier
  const canModerateGlobal =
    isGlobalVerifier && (registryRole === 'operator' || registryRole === 'embedded')
  const canModerate = isMaster || canModerateGlobal

  const copy = VIEW_COPY[view]



  const refreshSubscriptions = useCallback(() => {

    void api

      .listLogicBlockSubscriptions()

      .then((res) => {

        const pins = new Map<string, string>()

        for (const s of res.subscriptions) pins.set(s.packageId, s.versionPin)

        setLogicPins(pins)

      })

      .catch(() => setLogicPins(new Map()))

    void api

      .listSortPackSubscriptions()

      .then((res) => {

        const pins = new Map<string, string>()

        for (const s of res.subscriptions) pins.set(s.packageId, s.versionPin)

        setSortPins(pins)

      })

      .catch(() => setSortPins(new Map()))

    void api

      .listPluginSubscriptions('injector')

      .then((res) => {

        const pins = new Map<string, string>()

        for (const s of res.subscriptions) pins.set(s.packageId, s.versionPin)

        setInjectorPins(pins)

      })

      .catch(() => setInjectorPins(new Map()))

    void api

      .listPluginSubscriptions('ranker')

      .then((res) => {

        const pins = new Map<string, string>()

        for (const s of res.subscriptions) pins.set(s.packageId, s.versionPin)

        setRankerPins(pins)

      })

      .catch(() => setRankerPins(new Map()))

  }, [])



  useEffect(() => {

    refreshSubscriptions()

    void api

      .authMe()

      .then((me) => {

        setIsMaster(me.isMaster)

        setIsGlobalVerifier(me.isGlobalVerifier)

      })

      .catch(() => {

        setIsMaster(false)

        setIsGlobalVerifier(false)

      })

    void api

      .globalMarketplaceStatus()

      .then((s) => setRegistryRole(s.registryRole))

      .catch(() => setRegistryRole(null))

  }, [refreshSubscriptions, refreshKey])



  const bumpRefresh = () => setRefreshKey((k) => k + 1)



  const logicSubscribedIds = new Set(logicPins.keys())

  const sortSubscribedIds = new Set(sortPins.keys())

  const injectorSubscribedIds = new Set(injectorPins.keys())

  const rankerSubscribedIds = new Set(rankerPins.keys())



  return (

    <div className="project-workspace">

      <WorkspaceNav

        mode="marketplace"

        contextLabel="Plugins"

        marketplaceView={view}

        showVerifyPublisher={canVerify}

        showModerateListings={canModerate}

        onVerifyPublisherClick={() => setView('verify')}

        onModerateListingsClick={() => setView('moderate')}

        onMarketplaceViewChange={(next) => {

          setView(next)

          setSelection(null)

        }}

      />



      <main className="l2-main-panel">

        <div className="workspace-page marketplace-page">

          <header className="workspace-context-head">

            <div className="workspace-context-head-row">

              <h2>{copy.title}</h2>

            </div>

            <p className="card-hint">{copy.hint}</p>

          </header>



          {(view === 'browse' || view === 'installed') && (

            <div className="logic-blocks-browse-scope marketplace-product-kind" role="tablist" aria-label="Product kind">

              <button

                type="button"

                role="tab"

                aria-selected={productKind === 'logic_blocks'}

                className={`logic-blocks-scope-btn${productKind === 'logic_blocks' ? ' active' : ''}`}

                onClick={() => {

                  setProductKind('logic_blocks')

                  setSelection(null)

                }}

              >

                Logic blocks

              </button>

              <button

                type="button"

                role="tab"

                aria-selected={productKind === 'sort_packs'}

                className={`logic-blocks-scope-btn${productKind === 'sort_packs' ? ' active' : ''}`}

                onClick={() => {

                  setProductKind('sort_packs')

                  setSelection(null)

                }}

              >

                Sort packs

              </button>

              <button

                type="button"

                role="tab"

                aria-selected={productKind === 'injectors'}

                className={`logic-blocks-scope-btn${productKind === 'injectors' ? ' active' : ''}`}

                onClick={() => {

                  setProductKind('injectors')

                  setSelection(null)

                }}

              >

                Injectors

              </button>

              <button

                type="button"

                role="tab"

                aria-selected={productKind === 'rankers'}

                className={`logic-blocks-scope-btn${productKind === 'rankers' ? ' active' : ''}`}

                onClick={() => {

                  setProductKind('rankers')

                  setSelection(null)

                }}

              >

                Rankers

              </button>

            </div>

          )}



          <div className="marketplace-content">

            {view === 'browse' && productKind === 'logic_blocks' && (

              <LogicBlocksBrowseView

                key={refreshKey}

                selectedId={selection?.kind === 'logic_block' ? selection.pkg.id : null}

                subscribedIds={logicSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'logic_block', pkg })}

              />

            )}

            {view === 'browse' && productKind === 'sort_packs' && (

              <SortPacksBrowseView

                key={refreshKey}

                selectedId={selection?.kind === 'sort_pack' ? selection.pkg.id : null}

                subscribedIds={sortSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'sort_pack', pkg })}

              />

            )}

            {view === 'browse' && productKind === 'injectors' && (

              <InjectorsBrowseView

                key={refreshKey}

                kind="injector"

                selectedId={selection?.kind === 'injector' ? selection.pkg.id : null}

                subscribedIds={injectorSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'injector', pkg })}

              />

            )}

            {view === 'browse' && productKind === 'rankers' && (

              <InjectorsBrowseView

                key={refreshKey}

                kind="ranker"

                selectedId={selection?.kind === 'ranker' ? selection.pkg.id : null}

                subscribedIds={rankerSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'ranker', pkg })}

              />

            )}

            {view === 'installed' && productKind === 'logic_blocks' && (

              <LogicBlocksInstalledView

                key={refreshKey}

                selectedId={selection?.kind === 'logic_block' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'logic_block', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productKind === 'sort_packs' && (

              <SortPacksInstalledView

                key={refreshKey}

                selectedId={selection?.kind === 'sort_pack' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'sort_pack', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productKind === 'injectors' && (

              <InjectorsInstalledView

                key={refreshKey}

                kind="injector"

                selectedId={selection?.kind === 'injector' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'injector', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productKind === 'rankers' && (

              <InjectorsInstalledView

                key={refreshKey}

                kind="ranker"

                selectedId={selection?.kind === 'ranker' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'ranker', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'verify' && (

              <PublisherVerifyPanel

                isMaster={isMaster}

                isGlobalVerifier={isGlobalVerifier}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'moderate' && (

              <MarketplaceModerationPanel

                isMaster={isMaster}

                isGlobalVerifier={isGlobalVerifier}

                registryRole={registryRole}

                onChanged={bumpRefresh}

              />

            )}

          </div>

        </div>

      </main>



      <aside className="sidebar sidebar-right marketplace-sidebar">

        <div className="sidebar-head">

          <div className="sidebar-head-text">

            <h2>Details</h2>

            <span className="sidebar-head-sub">Listing</span>

          </div>

        </div>

        <div className="marketplace-sidebar-body sidebar-scroll">

          {selection?.kind === 'logic_block' ? (

            <LogicBlockDetailPanel

              variant="marketplace"

              pkg={selection.pkg}

              subscribedVersionPin={logicPins.get(selection.pkg.id) ?? null}

              onSubscribed={() => {

                refreshSubscriptions()

                bumpRefresh()

              }}

            />

          ) : selection?.kind === 'sort_pack' ? (

            <SortPackDetailPanel

              variant="marketplace"

              pkg={selection.pkg}

              subscribedVersionPin={sortPins.get(selection.pkg.id) ?? null}

              onSubscribed={() => {

                refreshSubscriptions()

                bumpRefresh()

              }}

            />

          ) : selection?.kind === 'injector' ? (

            <InjectorDetailPanel

              kind="injector"

              variant="marketplace"

              pkg={selection.pkg}

              subscribedVersionPin={injectorPins.get(selection.pkg.id) ?? null}

              onSubscribed={() => {

                refreshSubscriptions()

                bumpRefresh()

              }}

            />

          ) : selection?.kind === 'ranker' ? (

            <InjectorDetailPanel

              kind="ranker"

              variant="marketplace"

              pkg={selection.pkg}

              subscribedVersionPin={rankerPins.get(selection.pkg.id) ?? null}

              onSubscribed={() => {

                refreshSubscriptions()

                bumpRefresh()

              }}

            />

          ) : (

            <div className="marketplace-sidebar-empty">

              <p>Select a listing to preview trust status and subscribe.</p>

            </div>

          )}

        </div>

      </aside>

    </div>

  )

}


