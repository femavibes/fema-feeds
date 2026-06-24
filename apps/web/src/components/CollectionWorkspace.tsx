import { useCallback, useEffect, useState } from 'react'

import type { L2RuleGroup, LogicBlockPackage, PluginPackage, PublisherVerificationStatus, SortPackPackage } from '@cfb/core-types'
import type { CollectionWorkspaceView } from '../lib/workspace-views'



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



type CollectionKind = 'logic_blocks' | 'sort_packs' | 'custom_code'



function emptyLogicRoot(): L2RuleGroup {

  return { type: 'group', id: 'root', logic: 'any', children: [] }

}



export function CollectionWorkspace() {

  const [collectionKind, setCollectionKind] = useState<CollectionKind>('logic_blocks')

  const [collectionView, setCollectionView] = useState<CollectionWorkspaceView>('blocks')

  const [selectedLogic, setSelectedLogic] = useState<LogicBlockPackage | null>(null)

  const [selectedSort, setSelectedSort] = useState<SortPackPackage | null>(null)

  const [selectedPlugin, setSelectedPlugin] = useState<PluginPackage | null>(null)

  const [editingPkg, setEditingPkg] = useState<LogicBlockPackage | null>(null)

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const [showCustomCodeDialog, setShowCustomCodeDialog] = useState(false)

  const [publisherVerification, setPublisherVerification] =
    useState<PublisherVerificationStatus | null>(null)

  const [userDid, setUserDid] = useState<string | null>(null)

  const [refreshKey, setRefreshKey] = useState(0)

  const [creating, setCreating] = useState(false)

  const [error, setError] = useState<string | null>(null)



  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const openDeveloperGuide = useCallback(() => {
    setShowCustomCodeDialog(false)
    setCollectionView('developer_guide')
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
      kind: 'injector' | 'ranker'
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

        setCollectionKind('custom_code')

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



  return (

    <div className="project-workspace collection-workspace">

      {showCustomCodeDialog ? (

        <CustomCodeCreateDialog

          publisherVerification={publisherVerification}

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



      <WorkspaceNav

        mode="collection"

        contextLabel="My collection"

        collectionView={collectionView}

        onCollectionViewChange={setCollectionView}

        onOpenDeveloperGuide={() => setCollectionView('developer_guide')}

        onNewLogicBlockClick={() => {

          setCollectionView('blocks')

          setCollectionKind('logic_blocks')

          setError(null)

          setShowCreateDialog(true)

        }}

        onNewCustomCodeClick={() => {

          setCollectionView('blocks')

          setCollectionKind('custom_code')

          setError(null)

          setShowCustomCodeDialog(true)

        }}

      />



      <main className="l2-main-panel">

        <div className="workspace-page marketplace-page">

          {collectionView === 'developer_guide' ? (

            <PluginDeveloperGuide />

          ) : (

            <div className="collection-blocks-view">

          <header className="workspace-context-head">

            <div className="workspace-context-head-row">

              <h2>My collection</h2>

              {collectionKind === 'logic_blocks' ? (

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

              ) : null}

            </div>

            <p className="card-hint">

              Private workspace — publish to this deployment or the global marketplace when ready.

            </p>

            {error && !showCreateDialog ? <p className="field-error">{error}</p> : null}

          </header>



          <div className="logic-blocks-browse-scope marketplace-product-kind" role="tablist" aria-label="Collection kind">

            <button

              type="button"

              role="tab"

              aria-selected={collectionKind === 'logic_blocks'}

              className={`logic-blocks-scope-btn${collectionKind === 'logic_blocks' ? ' active' : ''}`}

              onClick={() => {

                setCollectionKind('logic_blocks')

                setSelectedSort(null)

              }}

            >

              Logic blocks

            </button>

            <button

              type="button"

              role="tab"

              aria-selected={collectionKind === 'sort_packs'}

              className={`logic-blocks-scope-btn${collectionKind === 'sort_packs' ? ' active' : ''}`}

              onClick={() => {

                setCollectionKind('sort_packs')

                setSelectedLogic(null)

              }}

            >

              Sort packs

            </button>

            <button

              type="button"

              role="tab"

              aria-selected={collectionKind === 'custom_code'}

              className={`logic-blocks-scope-btn${collectionKind === 'custom_code' ? ' active' : ''}`}

              onClick={() => {

                setCollectionKind('custom_code')

                setSelectedLogic(null)

                setSelectedSort(null)

              }}

            >

              Custom code

            </button>

          </div>



          <div className="marketplace-content">

            {collectionKind === 'logic_blocks' ? (

              <LogicBlocksCollectionView

                key={refreshKey}

                selectedId={selectedLogic?.id ?? null}

                onSelect={setSelectedLogic}

                onEdit={openEditor}

              />

            ) : collectionKind === 'sort_packs' ? (

              <SortPacksCollectionView

                key={refreshKey}

                selectedId={selectedSort?.id ?? null}

                onSelect={setSelectedSort}

              />

            ) : (

              <PluginsCollectionView

                key={refreshKey}

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

        <div className="sidebar-head">

          <div className="sidebar-head-text">

            <h2>Details</h2>

            <span className="sidebar-head-sub">

              {collectionKind === 'logic_blocks'

                ? 'Logic block'

                : collectionKind === 'sort_packs'

                  ? 'Sort pack'

                  : 'Custom code'}

            </span>

          </div>

        </div>

        <div className="marketplace-sidebar-body sidebar-scroll">

          {collectionView === 'developer_guide' ? (

            <div className="plugin-dev-sidebar-hint">

              <p className="card-hint">

                Full contracts and limits are in the guide. Use <strong>My collection</strong> to create

                packages and upload WASM artifacts.

              </p>

            </div>

          ) : collectionKind === 'logic_blocks' ? (

            <LogicBlockDetailPanel

              variant="collection"

              pkg={selectedLogic}

              userDid={userDid}

              onPublished={handlePublishedLogic}

              onEdit={isLogicOwner && selectedLogic ? () => openEditor(selectedLogic) : undefined}

              onMetadataSaved={(pkg) => {

                setSelectedLogic(pkg)

                bumpRefresh()

              }}

            />

          ) : collectionKind === 'sort_packs' ? (

            <SortPackDetailPanel

              variant="collection"

              pkg={selectedSort}

              userDid={userDid}

              onPublished={handlePublishedSort}

              onMetadataSaved={(pkg) => {

                setSelectedSort(pkg)

                bumpRefresh()

              }}

            />

          ) : (

            <InjectorDetailPanel

              kind={selectedPlugin?.kind ?? 'ranker'}

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

              onMetadataSaved={(pkg) => {

                setSelectedPlugin(pkg)

                bumpRefresh()

              }}

              onOpenDeveloperGuide={openDeveloperGuide}

            />

          )}

        </div>

      </aside>

    </div>

  )

}


