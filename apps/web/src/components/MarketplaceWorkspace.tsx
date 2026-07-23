import { useCallback, useEffect, useState } from 'react'

import type { LogicBlockPackage, PluginPackage, SortPackPackage } from '@cfb/core-types'

import type { MarketplaceWorkspaceView, MarketplaceProductScope } from '../lib/workspace-views'
import { marketplaceProduct } from '../lib/marketplace-products'
import type { MarketplaceCatalogScope, MarketplaceCatalogSort, MarketplaceCategoryFilter, MarketplaceTierFilter } from '../lib/marketplace-catalog'



import { api } from '../api/client'

import { WorkspaceNav } from './WorkspaceNav'

import { LogicBlocksBrowseView } from './logic-blocks/LogicBlocksBrowseView'

import { LogicBlocksInstalledView } from './logic-blocks/LogicBlocksInstalledView'

import { PublisherVerifyPanel } from './logic-blocks/PublisherVerifyPanel'
import { MarketplaceModerationPanel } from './marketplace/MarketplaceModerationPanel'
import { MarketplaceTaxonomyPanel } from './marketplace/MarketplaceTaxonomyPanel'
import { MarketplaceCatalogControls } from './marketplace/MarketplaceCatalogControls'

import { SortPacksBrowseView } from './sort-packs/SortPacksBrowseView'

import { PersonalizationFormulasBrowseView } from './sort-packs/PersonalizationFormulasBrowseView'

import { SortPacksInstalledView } from './sort-packs/SortPacksInstalledView'

import { InjectorsBrowseView } from './plugins/InjectorsBrowseView'

import { InjectorsInstalledView } from './plugins/InjectorsInstalledView'

import { MarketplaceProductSidebar } from './marketplace/MarketplaceProductSidebar'
import { MobileRail } from './MobileRail'
import { MarketplaceFeaturedBrowseView } from './marketplace/MarketplaceFeaturedBrowseView'
import { SidebarExpandBar } from './SidebarExpandBar'



const VIEW_COPY: Record<MarketplaceWorkspaceView, { title: string; hint: string }> = {

  browse: {

    title: 'Browse',

    hint: 'Subscribe to logic blocks, sorting formulas, personalization, injectors, and enrichers published on this deployment or the global marketplace.',

  },

  installed: {

    title: 'Subscriptions',

    hint: 'Logic blocks go in the feed visual editor; sorting and personalization formulas and plugins go on the feed Sorting and Personalization tabs.',

  },

  verify: {

    title: 'Verify publisher',

    hint: 'Look up a Bluesky handle to verify or revoke publisher status.',

  },

  moderate: {

    title: 'Moderate listings',

    hint: 'Approve unverified catalog listings for this deployment or the global marketplace.',

  },

  taxonomy: {
    title: 'Categories & Tags',
    hint: 'Manage the category and tag taxonomy for marketplace listings.',
  },

}



type Selection =

  | { kind: 'logic_block'; pkg: LogicBlockPackage }

  | { kind: 'sort_pack'; pkg: SortPackPackage }

  | { kind: 'injector'; pkg: PluginPackage }

  | { kind: 'ranker'; pkg: PluginPackage }

  | { kind: 'enricher'; pkg: PluginPackage }

  | null



export function MarketplaceWorkspace() {

  const [view, setView] = useState<MarketplaceWorkspaceView>('browse')

  const [productScope, setProductScope] = useState<MarketplaceProductScope>('all')

  const [selection, setSelection] = useState<Selection>(null)

  const [logicPins, setLogicPins] = useState<Map<string, string>>(new Map())

  const [sortPins, setSortPins] = useState<Map<string, string>>(new Map())

  const [injectorPins, setInjectorPins] = useState<Map<string, string>>(new Map())

  const [rankerPins, setRankerPins] = useState<Map<string, string>>(new Map())

  const [isMaster, setIsMaster] = useState(false)

  const [isGlobalVerifier, setIsGlobalVerifier] = useState(false)

  const [registryRole, setRegistryRole] = useState<'registry' | 'consumer' | 'embedded' | null>(
    null,
  )

  const [refreshKey, setRefreshKey] = useState(0)

  const [catalogScope, setCatalogScope] = useState<MarketplaceCatalogScope>('all')
  const [catalogSort, setCatalogSort] = useState<MarketplaceCatalogSort>('updated_desc')
  const [catalogCategory, setCatalogCategory] = useState<MarketplaceCategoryFilter>('all')
  const [catalogTier, setCatalogTier] = useState<MarketplaceTierFilter>('all')
  const [sidebarExpanded, setSidebarExpanded] = useState(false)



  const canVerify = isMaster || isGlobalVerifier
  const canModerateGlobal = isGlobalVerifier && registryRole === 'registry'
  const canModerate = isMaster || canModerateGlobal

  const copy = VIEW_COPY[view]
  const scopeLabel =
    productScope === 'all'
      ? view === 'browse'
        ? 'Featured'
        : 'All'
      : marketplaceProduct(productScope).label
  const pageTitle =
    view === 'browse' || view === 'installed' ? `${copy.title} · ${scopeLabel}` : copy.title
  const pageHint =
    view === 'browse'
      ? productScope === 'all'
        ? 'Browse logic blocks, sorting formulas, personalization, injectors, and enrichers from this deployment and the global marketplace.'
        : marketplaceProduct(productScope).browseHint
      : view === 'installed'
        ? productScope === 'all'
          ? 'Everything you subscribe to across product types. Pins apply per feed — logic blocks in the visual editor; sorting and personalization on their feed tabs; injectors on Sorting.'
          : `Pinned versions appear on feeds — ${marketplaceProduct(productScope).summary}`
        : copy.hint
  const showProductMeta =
    (view === 'browse' || view === 'installed') && productScope !== 'all'
  const product = productScope === 'all' ? null : marketplaceProduct(productScope)



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

    <div className={`project-workspace project-workspace--catalog${sidebarExpanded ? ' is-sidebar-expanded' : ''}`}>

      <WorkspaceNav

        mode="marketplace"

        contextLabel="Packages"

        marketplaceView={view}

        showVerifyPublisher={canVerify}

        showModerateListings={canModerate}

        onVerifyPublisherClick={() => setView('verify')}

        onModerateListingsClick={() => setView('moderate')}

        showTaxonomy={canModerate}
        onTaxonomyClick={() => setView('taxonomy')}

        onMarketplaceViewChange={(next) => {
          setView(next)
          setSelection(null)
        }}
        marketplaceProductKind={productScope}
        onMarketplaceProductKindChange={(kind) => {
          setProductScope(kind)
          setSelection(null)
          if (kind !== 'all') {
            const product = marketplaceProduct(kind)
            setCatalogTier((current) => {
              if (current === 'native' && !product.supportsNative) return 'custom_code'
              if (current === 'custom_code' && !product.supportsCustomCode) return 'native'
              return current
            })
          }
        }}
      />



      <main className="l2-main-panel">

        <div className="workspace-page marketplace-page">

          <header className="workspace-context-head">

            <div className="workspace-context-head-row workspace-context-head-row-split">

              <h2>{pageTitle}</h2>

              {view === 'browse' ? (
                <MarketplaceCatalogControls
                  scope={catalogScope}
                  sort={catalogSort}
                  category={catalogCategory}
                  tier={catalogTier}
                  productKind={productScope}
                  onScopeChange={setCatalogScope}
                  onSortChange={setCatalogSort}
                  onCategoryChange={setCatalogCategory}
                  onTierChange={setCatalogTier}
                />
              ) : null}

            </div>

            <p className="card-hint">{pageHint}</p>
            {showProductMeta && product ? (
              <>
                <p className="card-hint marketplace-product-meta">
                  <strong>Runs:</strong> {product.runsAt}
                </p>
                <p className="card-hint marketplace-product-meta">
                  <strong>Access:</strong> {product.access}
                </p>
              </>
            ) : null}

          </header>



          <div className="marketplace-content">

            {view === 'browse' && productScope === 'all' && (
              <MarketplaceFeaturedBrowseView
                key={refreshKey}
                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selection={selection}
                logicSubscribedIds={logicSubscribedIds}
                sortSubscribedIds={sortSubscribedIds}
                injectorSubscribedIds={injectorSubscribedIds}
                rankerSubscribedIds={rankerSubscribedIds}
                onSelect={setSelection}
              />
            )}

            {view === 'browse' && productScope === 'logic_blocks' && (

              <LogicBlocksBrowseView

                key={refreshKey}

                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selectedId={selection?.kind === 'logic_block' ? selection.pkg.id : null}

                subscribedIds={logicSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'logic_block', pkg })}

              />

            )}

            {view === 'browse' && productScope === 'sort_packs' && (

              <SortPacksBrowseView

                key={refreshKey}

                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selectedId={selection?.kind === 'sort_pack' ? selection.pkg.id : null}

                subscribedIds={sortSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'sort_pack', pkg })}

              />

            )}

            {view === 'browse' && productScope === 'rankers' && (

              <PersonalizationFormulasBrowseView

                key={refreshKey}

                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selectedSortId={
                  selection?.kind === 'sort_pack' && selection.pkg.packKind === 'personalization'
                    ? selection.pkg.id
                    : null
                }
                selectedPluginId={selection?.kind === 'ranker' ? selection.pkg.id : null}
                sortSubscribedIds={sortSubscribedIds}
                rankerSubscribedIds={rankerSubscribedIds}
                onSelectFormula={(pkg) => setSelection({ kind: 'sort_pack', pkg })}
                onSelectPlugin={(pkg) => setSelection({ kind: 'ranker', pkg })}

              />

            )}

            {view === 'browse' && productScope === 'injectors' && (

              <InjectorsBrowseView

                key={refreshKey}

                kind="injector"

                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selectedId={selection?.kind === 'injector' ? selection.pkg.id : null}

                subscribedIds={injectorSubscribedIds}

                onSelect={(pkg) => setSelection({ kind: 'injector', pkg })}

              />

            )}

            {view === 'browse' && productScope === 'enrichers' && (

              <InjectorsBrowseView

                key={refreshKey}

                kind="enricher"

                catalogScope={catalogScope}
                catalogSort={catalogSort}
                catalogCategory={catalogCategory}
                catalogTier={catalogTier}
                selectedId={selection?.kind === 'enricher' ? selection.pkg.id : null}

                subscribedIds={new Set()}

                onSelect={(pkg) => setSelection({ kind: 'enricher', pkg })}

              />

            )}

            {view === 'installed' && productScope === 'all' && (
              <div className="marketplace-featured-sections">
                <section className="marketplace-featured-section" aria-label={marketplaceProduct('logic_blocks').label}>
                  <h3 className="marketplace-featured-section-title">{marketplaceProduct('logic_blocks').label}</h3>
                  <LogicBlocksInstalledView
                    key={`${refreshKey}-logic`}
                    selectedId={selection?.kind === 'logic_block' ? selection.pkg.id : null}
                    onSelect={(pkg) => setSelection({ kind: 'logic_block', pkg })}
                    onChanged={bumpRefresh}
                  />
                </section>
                <section className="marketplace-featured-section" aria-label={marketplaceProduct('sort_packs').label}>
                  <h3 className="marketplace-featured-section-title">{marketplaceProduct('sort_packs').label}</h3>
                  <SortPacksInstalledView
                    key={`${refreshKey}-sort`}
                    selectedId={selection?.kind === 'sort_pack' ? selection.pkg.id : null}
                    onSelect={(pkg) => setSelection({ kind: 'sort_pack', pkg })}
                    onChanged={bumpRefresh}
                  />
                </section>
                <section className="marketplace-featured-section" aria-label={marketplaceProduct('rankers').label}>
                  <h3 className="marketplace-featured-section-title">{marketplaceProduct('rankers').label}</h3>
                  <InjectorsInstalledView
                    key={`${refreshKey}-ranker`}
                    kind="ranker"
                    selectedId={selection?.kind === 'ranker' ? selection.pkg.id : null}
                    onSelect={(pkg) => setSelection({ kind: 'ranker', pkg })}
                    onChanged={bumpRefresh}
                  />
                </section>
                <section className="marketplace-featured-section" aria-label={marketplaceProduct('injectors').label}>
                  <h3 className="marketplace-featured-section-title">{marketplaceProduct('injectors').label}</h3>
                  <InjectorsInstalledView
                    key={`${refreshKey}-injector`}
                    kind="injector"
                    selectedId={selection?.kind === 'injector' ? selection.pkg.id : null}
                    onSelect={(pkg) => setSelection({ kind: 'injector', pkg })}
                    onChanged={bumpRefresh}
                  />
                </section>
                <section className="marketplace-featured-section" aria-label={marketplaceProduct('enrichers').label}>
                  <h3 className="marketplace-featured-section-title">{marketplaceProduct('enrichers').label}</h3>
                  <InjectorsInstalledView
                    key={`${refreshKey}-enricher`}
                    kind="enricher"
                    selectedId={selection?.kind === 'enricher' ? selection.pkg.id : null}
                    onSelect={(pkg) => setSelection({ kind: 'enricher', pkg })}
                    onChanged={bumpRefresh}
                  />
                </section>
              </div>
            )}

            {view === 'installed' && productScope === 'logic_blocks' && (

              <LogicBlocksInstalledView

                key={refreshKey}

                selectedId={selection?.kind === 'logic_block' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'logic_block', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productScope === 'sort_packs' && (

              <SortPacksInstalledView

                key={refreshKey}

                selectedId={selection?.kind === 'sort_pack' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'sort_pack', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productScope === 'injectors' && (

              <InjectorsInstalledView

                key={refreshKey}

                kind="injector"

                selectedId={selection?.kind === 'injector' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'injector', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productScope === 'rankers' && (

              <InjectorsInstalledView

                key={refreshKey}

                kind="ranker"

                selectedId={selection?.kind === 'ranker' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'ranker', pkg })}

                onChanged={bumpRefresh}

              />

            )}

            {view === 'installed' && productScope === 'enrichers' && (

              <InjectorsInstalledView

                key={refreshKey}

                kind="enricher"

                selectedId={selection?.kind === 'enricher' ? selection.pkg.id : null}

                onSelect={(pkg) => setSelection({ kind: 'enricher', pkg })}

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

            {view === 'taxonomy' && (
              <MarketplaceTaxonomyPanel registryRole={registryRole} />
            )}

          </div>

        </div>

      </main>



      <MobileRail label="Details">
      <aside className="sidebar sidebar-right marketplace-sidebar">

        {(view === 'browse' || view === 'installed') && (
          <MarketplaceProductSidebar
            selection={selection}
            subscribedPin={
              selection?.kind === 'logic_block'
                ? logicPins.get(selection.pkg.id) ?? null
                : selection?.kind === 'sort_pack'
                  ? sortPins.get(selection.pkg.id) ?? null
                  : selection?.kind === 'injector'
                    ? injectorPins.get(selection.pkg.id) ?? null
                    : selection?.kind === 'ranker'
                      ? rankerPins.get(selection.pkg.id) ?? null
                      : selection?.kind === 'enricher'
                        ? null
                        : null
            }
            onSubscriptionChanged={() => {
              refreshSubscriptions()
              bumpRefresh()
            }}
            emptyHint={
              view === 'installed'
                ? 'Select a subscription to manage version pins.'
                : 'Select a listing to preview trust status and subscribe.'
            }
          />
        )}
        {selection && (
          <SidebarExpandBar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((v) => !v)} />
        )}
      </aside>
      </MobileRail>

    </div>

  )

}


