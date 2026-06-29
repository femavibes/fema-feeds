import { useCallback, useEffect, useState } from 'react'

import type { L2RuleGroup, LogicBlockPackage, PluginPackage, PublisherVerificationStatus, SortPackPackage } from '@cfb/core-types'
import type { CollectionWorkspaceView, MarketplaceProductScope } from '../lib/workspace-views'
import { isCustomCodeProduct, marketplaceProduct } from '../lib/marketplace-products'



import { api } from '../api/client'

import { WorkspaceNav } from './WorkspaceNav'

import { LogicBlockCreateDialog } from './logic-blocks/LogicBlockCreateDialog'

import { LogicBlockDetailPanel } from './logic-blocks/LogicBlockDetailPanel'

import { LogicBlockVisualEditor } from './logic-blocks/LogicBlockVisualEditor'

import { LogicBlocksCollectionView } from './logic-blocks/LogicBlocksCollectionView'

import { SortPackDetailPanel } from './sort-packs/SortPackDetailPanel'

import { SortPacksCollectionView } from './sort-packs/SortPacksCollectionView'

import { CustomCodeCreateDialog } from './plugins/CustomCodeCreateDialog'

import { InjectorDetailPanel } from './plugins/InjectorDetailPanel'

import { PluginDeveloperGuide } from './plugins/PluginDeveloperGuide'

import { PluginsCollectionView } from './plugins/PluginsCollectionView'

import {
  MarketplaceListingEditor,
  type ListingEditorTarget,
} from './marketplace/MarketplaceListingEditor'
import { CollectionAllView, type CollectionAllSelection } from './marketplace/CollectionAllView'



function emptyLogicRoot(): L2RuleGroup {

  return { type: 'group', id: 'root', logic: 'any', children: [] }

}



function clearCollectionSelection(
  kind: MarketplaceProductScope,
  setters: {
    setSelectedLogic: (v: LogicBlockPackage | null) => void
    setSelectedSort: (v: SortPackPackage | null) => void
    setSelectedPlugin: (v: PluginPackage | null) => void
  },
) {
  if (kind === 'all') {
    setters.setSelectedLogic(null)
    setters.setSelectedSort(null)
    setters.setSelectedPlugin(null)
    return
  }
  if (kind !== 'logic_blocks') setters.setSelectedLogic(null)
  if (kind !== 'sort_packs') setters.setSelectedSort(null)
  setters.setSelectedPlugin(null)
}



export function CollectionWorkspace() {

  const [collectionScope, setCollectionScope] = useState<MarketplaceProductScope>('all')

  const [collectionView, setCollectionView] = useState<CollectionWorkspaceView>('blocks')

  const [selectedLogic, setSelectedLogic] = useState<LogicBlockPackage | null>(null)

  const [selectedSort, setSelectedSort] = useState<SortPackPackage | null>(null)

  const [selectedPlugin, setSelectedPlugin] = useState<PluginPackage | null>(null)

  const [editingPkg, setEditingPkg] = useState<LogicBlockPackage | null>(null)

  const [listingEditor, setListingEditor] = useState<ListingEditorTarget | null>(null)

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const [showCustomCodeDialog, setShowCustomCodeDialog] = useState(false)

  const [publisherVerification, setPublisherVerification] =
    useState<PublisherVerificationStatus | null>(null)

  const [userDid, setUserDid] = useState<string | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)

  const [creating, setCreating] = useState(false)

  const [error, setError] = useState<string | null>(null)



  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleListingSaved = useCallback((next: ListingEditorTarget) => {
    setListingEditor(next)
    if (next.productKind === 'logic_block') setSelectedLogic(next.pkg)
    else if (next.productKind === 'sort_pack') setSelectedSort(next.pkg)
    else setSelectedPlugin(next.pkg)
    bumpRefresh()
  }, [bumpRefresh])

  const openDeveloperGuide = useCallback(() => {
    setShowCustomCodeDialog(false)
    setCollectionView('developer_guide')
  }, [])

  const handleCollectionProductKindChange = useCallback((kind: MarketplaceProductScope) => {
    setCollectionView('blocks')
    setListingEditor(null)
    setCollectionScope(kind)
    clearCollectionSelection(kind, {
      setSelectedLogic,
      setSelectedSort,
      setSelectedPlugin,
    })
  }, [])

  const handleCollectionAllSelect = useCallback((sel: CollectionAllSelection) => {
    if (sel.kind === 'logic_block') {
      setSelectedLogic(sel.pkg)
      setSelectedSort(null)
      setSelectedPlugin(null)
    } else if (sel.kind === 'sort_pack') {
      setSelectedSort(sel.pkg)
      setSelectedLogic(null)
      setSelectedPlugin(null)
    } else {
      setSelectedPlugin(sel.pkg)
      setSelectedLogic(null)
      setSelectedSort(null)
    }
  }, [])



  useEffect(() => {

    void api

      .authMe()

      .then((me) => {

        setUserDid(me.user?.did ?? null)

        setPublisherVerification(me.publisherVerification ?? null)

      })

      .catch(() => {

        setUserDid(null)

        setPublisherVerification(null)

      })

  }, [refreshKey])



  const handlePublishedLogic = () => {

    bumpRefresh()

    if (selectedLogic) {

      void api.getLogicBlock(selectedLogic.id).then((res) => setSelectedLogic(res.package)).catch(() => {})

    }

  }



  const handlePublishedSort = () => {

    bumpRefresh()

    if (selectedSort) {

      void api.getSortPack(selectedSort.id).then((res) => setSelectedSort(res.package)).catch(() => {})

    }

  }



  const handleSavedFromEditor = (pkg: LogicBlockPackage) => {

    setSelectedLogic(pkg)

    setEditingPkg(null)

    bumpRefresh()

  }



  const openEditor = useCallback((pkg: LogicBlockPackage) => {

    setSelectedLogic(pkg)

    setEditingPkg(pkg)

    setError(null)

  }, [])



  const createNewLogicBlock = useCallback(

    async (meta: { name: string; slug: string; description: string }) => {

      setCreating(true)

      setError(null)

      try {

        const res = await api.createLogicBlock({

          name: meta.name,

          slug: meta.slug,

          description: meta.description || undefined,

          root: emptyLogicRoot(),

          visibility: 'collection',

        })

        setShowCreateDialog(false)

        bumpRefresh()

        openEditor(res.package)

      } catch (e) {

        setError(e instanceof Error ? e.message : 'Could not create logic block')

      } finally {

        setCreating(false)

      }

    },

    [bumpRefresh, openEditor],

  )



  const createCustomCode = useCallback(
    async (input: {
      kind: 'injector' | 'ranker' | 'enricher'
      runtime: 'native' | 'remote' | 'wasm' | 'worker'
      name: string
      slug: string
      description: string
      remoteEndpoint?: string
    }) => {

      setCreating(true)

      setError(null)

      try {

        const res = await api.createPlugin(input)

        setShowCustomCodeDialog(false)

        setCollectionScope(input.kind === 'injector' ? 'injectors' : 'rankers')

        setSelectedPlugin(res.package)

        setSelectedLogic(null)

        setSelectedSort(null)

        bumpRefresh()

      } catch (e) {

        setError(e instanceof Error ? e.message : 'Could not create custom code package')

      } finally {

        setCreating(false)

      }

    },

    [bumpRefresh],

  )



  if (editingPkg) {

    return (

      <LogicBlockVisualEditor

        pkg={editingPkg}

        onClose={() => setEditingPkg(null)}

        onSaved={handleSavedFromEditor}

      />

    )

  }



  const isLogicOwner = Boolean(userDid && selectedLogic && selectedLogic.ownerDid === userDid)

  const isSortOwner = Boolean(userDid && selectedSort && selectedSort.ownerDid === userDid)

  const showingLogicDetail = Boolean(
    collectionView !== 'developer_guide' &&
      !listingEditor &&
      selectedLogic &&
      (collectionScope === 'logic_blocks' || collectionScope === 'all'),
  )

  const showLogicEditInHeader = showingLogicDetail && isLogicOwner



  return (
    <>
      {showCustomCodeDialog ? (
        <CustomCodeCreateDialog
          publisherVerification={publisherVerification}
          defaultKind={
            collectionScope === 'rankers' ? 'ranker' : 'injector'
          }
          busy={creating}
          error={error}
          onCancel={() => {
            setShowCustomCodeDialog(false)
            setError(null)
          }}
          onOpenDeveloperGuide={openDeveloperGuide}
          onCreate={(input) => void createCustomCode(input)}
        />
      ) : null}

      {showCreateDialog ? (
        <LogicBlockCreateDialog
          busy={creating}
          error={error}
          onCancel={() => {
            setShowCreateDialog(false)
            setError(null)
          }}
          onCreate={(meta) => void createNewLogicBlock(meta)}
        />
      ) : null}

      <div className="project-workspace collection-workspace project-workspace--catalog">
      <WorkspaceNav
        mode="collection"
        contextLabel="My collection"
        collectionView={collectionView}
        onCollectionViewChange={setCollectionView}
        collectionProductKind={collectionScope}
        onCollectionProductKindChange={handleCollectionProductKindChange}
        onOpenDeveloperGuide={() => setCollectionView('developer_guide')}

        onNewLogicBlockClick={() => {

          setCollectionView('blocks')

          setCollectionScope('logic_blocks')

          setError(null)

          setShowCreateDialog(true)

        }}

        onNewCustomCodeClick={() => {

          setCollectionView('blocks')

          if (collectionScope !== 'injectors' && collectionScope !== 'rankers') {
            setCollectionScope('injectors')
          }

          setError(null)

          setShowCustomCodeDialog(true)

        }}

      />



      <main className="l2-main-panel">

        <div className="workspace-page marketplace-page">

          {collectionView === 'developer_guide' ? (

            <PluginDeveloperGuide />

          ) : listingEditor ? (

            <MarketplaceListingEditor
              target={listingEditor}
              onBack={() => setListingEditor(null)}
              onSaved={handleListingSaved}
            />

          ) : (

            <div className="collection-blocks-view">

          {(() => {
            const scopeLabel =
              collectionScope === 'all' ? 'All' : marketplaceProduct(collectionScope).label
            const product = collectionScope === 'all' ? null : marketplaceProduct(collectionScope)
            return (
          <header className="workspace-context-head">

            <div className="workspace-context-head-row">

              <h2>
                My collection Â· {scopeLabel}
                {product ? (
                  <span className="marketplace-product-tier">
                    {product.tier === 'native' ? 'Native' : 'Custom code'}
                  </span>
                ) : null}
              </h2>

              {collectionScope === 'logic_blocks' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={creating}
                  onClick={() => {
                    setError(null)
                    setShowCreateDialog(true)
                  }}
                >
                  New logic block
                </button>
              ) : collectionScope !== 'all' && isCustomCodeProduct(collectionScope) ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={creating}
                  onClick={() => {
                    setError(null)
                    setShowCustomCodeDialog(true)
                  }}
                >
                  New {product!.label.toLowerCase().replace(/s$/, '')}
                </button>
              ) : null}

            </div>

            <p className="card-hint">
              {collectionScope === 'all'
                ? 'Your packages across logic blocks, sort packs, injectors, and personalization plugins. Pick a category in the sidebar to focus or create new items.'
                : product!.collectionHint}
            </p>
            {product ? (
              <>
                <p className="card-hint marketplace-product-meta">
                  <strong>Runs:</strong> {product.runsAt}
                </p>
                <p className="card-hint marketplace-product-meta">
                  <strong>Access:</strong> {product.access}
                </p>
              </>
            ) : null}

            {error && !showCreateDialog ? <p className="field-error">{error}</p> : null}

          </header>
            )
          })()}

          <div className="marketplace-content">

            {collectionScope === 'all' ? (
              <CollectionAllView
                key={refreshKey}
                selection={
                  selectedLogic
                    ? { kind: 'logic_block', pkg: selectedLogic }
                    : selectedSort
                      ? { kind: 'sort_pack', pkg: selectedSort }
                      : selectedPlugin
                        ? {
                            kind: selectedPlugin.kind === 'injector' ? 'injector' : 'ranker',
                            pkg: selectedPlugin,
                          }
                        : null
                }
                onSelect={handleCollectionAllSelect}
              />
            ) : collectionScope === 'logic_blocks' ? (

              <LogicBlocksCollectionView

                key={refreshKey}

                selectedId={selectedLogic?.id ?? null}

                onSelect={setSelectedLogic}

                onEdit={openEditor}

              />

            ) : collectionScope === 'sort_packs' ? (

              <SortPacksCollectionView

                key={refreshKey}

                selectedId={selectedSort?.id ?? null}

                onSelect={setSelectedSort}

              />

            ) : collectionScope === 'injectors' ? (

              <PluginsCollectionView

                key={`${refreshKey}-injector`}

                kind="injector"

                selectedId={selectedPlugin?.id ?? null}

                onSelect={setSelectedPlugin}

              />

            ) : (

              <PluginsCollectionView

                key={`${refreshKey}-ranker`}

                kind="ranker"

                selectedId={selectedPlugin?.id ?? null}

                onSelect={setSelectedPlugin}

              />

            )}

          </div>

            </div>

          )}

        </div>

      </main>



      <aside className="sidebar sidebar-right marketplace-sidebar">

        <div className={`sidebar-head${showLogicEditInHeader ? ' marketplace-sidebar-toolbar' : ''}`}>

          <div className="sidebar-head-text marketplace-sidebar-head-labels">

            <h2>Details</h2>

            <span className="sidebar-head-sub">
              {collectionScope === 'all'
                ? selectedLogic
                  ? marketplaceProduct('logic_blocks').label
                  : selectedSort
                    ? marketplaceProduct('sort_packs').label
                    : selectedPlugin
                      ? marketplaceProduct(selectedPlugin.kind === 'injector' ? 'injectors' : 'rankers').label
                      : 'All packages'
                : marketplaceProduct(collectionScope).label}
            </span>

          </div>

          {showLogicEditInHeader && selectedLogic ? (
            <div className="marketplace-sidebar-toolbar-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openEditor(selectedLogic)}
              >
                Edit logic
              </button>
            </div>
          ) : null}

        </div>

        <div className="marketplace-sidebar-body sidebar-scroll">

          {collectionView === 'developer_guide' ? (

            <div className="plugin-dev-sidebar-hint">

              <p className="card-hint">

                Full contracts and limits are in the guide. Use <strong>My collection</strong> to create

                packages and upload WASM artifacts.

              </p>

            </div>

          ) : collectionScope === 'all' && selectedLogic ? (

            <LogicBlockDetailPanel

              variant="collection"

              pkg={selectedLogic}

              userDid={userDid}

              onPublished={handlePublishedLogic}

              onEditListing={
                isLogicOwner && selectedLogic
                  ? () => setListingEditor({ productKind: 'logic_block', pkg: selectedLogic })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedLogic(pkg)

                bumpRefresh()

              }}

            />

          ) : collectionScope === 'all' && selectedSort ? (

            <SortPackDetailPanel

              variant="collection"

              pkg={selectedSort}

              userDid={userDid}

              onPublished={handlePublishedSort}

              onEditListing={
                isSortOwner && selectedSort
                  ? () => setListingEditor({ productKind: 'sort_pack', pkg: selectedSort })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedSort(pkg)

                bumpRefresh()

              }}

            />

          ) : collectionScope === 'all' && selectedPlugin ? (

            <InjectorDetailPanel

              kind={selectedPlugin.kind}

              variant="collection"

              pkg={selectedPlugin}

              userDid={userDid}

              onPublished={() => {

                bumpRefresh()

                if (selectedPlugin) {

                  void api

                    .getPlugin(selectedPlugin.id)

                    .then((res) => setSelectedPlugin(res.package))

                    .catch(() => {})

                }

              }}

              onEditListing={
                selectedPlugin && userDid && selectedPlugin.ownerDid === userDid
                  ? () =>
                      setListingEditor({
                        productKind: selectedPlugin.kind,
                        pkg: selectedPlugin,
                      })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedPlugin(pkg)

                bumpRefresh()

              }}

              onOpenDeveloperGuide={openDeveloperGuide}

            />

          ) : collectionScope === 'all' ? (

            <div className="marketplace-sidebar-empty">
              <p>Select a package to view details, publish, or edit its storefront listing.</p>
            </div>

          ) : collectionScope === 'logic_blocks' ? (

            <LogicBlockDetailPanel

              variant="collection"

              pkg={selectedLogic}

              userDid={userDid}

              onPublished={handlePublishedLogic}

              onEditListing={
                isLogicOwner && selectedLogic
                  ? () => setListingEditor({ productKind: 'logic_block', pkg: selectedLogic })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedLogic(pkg)

                bumpRefresh()

              }}

            />

          ) : collectionScope === 'sort_packs' ? (

            <SortPackDetailPanel

              variant="collection"

              pkg={selectedSort}

              userDid={userDid}

              onPublished={handlePublishedSort}

              onEditListing={
                isSortOwner && selectedSort
                  ? () => setListingEditor({ productKind: 'sort_pack', pkg: selectedSort })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedSort(pkg)

                bumpRefresh()

              }}

            />

          ) : collectionScope === 'injectors' || collectionScope === 'rankers' ? (

            <InjectorDetailPanel

              kind={collectionScope === 'injectors' ? 'injector' : 'ranker'}

              variant="collection"

              pkg={selectedPlugin}

              userDid={userDid}

              onPublished={() => {

                bumpRefresh()

                if (selectedPlugin) {

                  void api

                    .getPlugin(selectedPlugin.id)

                    .then((res) => setSelectedPlugin(res.package))

                    .catch(() => {})

                }

              }}

              onEditListing={
                selectedPlugin && userDid && selectedPlugin.ownerDid === userDid
                  ? () =>
                      setListingEditor({
                        productKind: collectionScope === 'injectors' ? 'injector' : 'ranker',
                        pkg: selectedPlugin,
                      })
                  : undefined
              }

              onMetadataSaved={(pkg) => {

                setSelectedPlugin(pkg)

                bumpRefresh()

              }}

              onOpenDeveloperGuide={openDeveloperGuide}

            />

          ) : null}

        </div>

      </aside>

      </div>
    </>
  )
}


