import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LogicBlockPackage } from '@cfb/core-types'

import { api } from '../../../api/client'
import {
  PALETTE_CATEGORIES,
  PALETTE_ITEMS,
  paletteDragPayload,
  type CollectionSectionId,
  type PaletteCategory,
  type PaletteItem,
  type PaletteLogicBlockEntry,
  type PalettePick,
  type PaletteSourceId,
  type SubscriptionSectionId,
} from './palette'

interface Props {
  onPick: (pick: PalettePick) => void
  itemFilter?: (item: PaletteItem) => boolean
  /** Hide collection / subscription sources (prefilter editor). */
  nativeOnly?: boolean
  /** Configured feed sources (shown in a Sources section of the palette). */
  feedSources?: import('@cfb/core-types').NativeFeedSource[]
}

function matchesSearch(text: string, q: string): boolean {
  return text.toLowerCase().includes(q)
}

function PaletteNodeButton({
  label,
  description,
  badge,
  draggable,
  onClick,
  onDragStart,
}: {
  label: string
  description: string
  badge?: string
  draggable: boolean
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <li>
      <button
        type="button"
        className="l2-palette-item"
        draggable={draggable}
        onClick={onClick}
        onDragStart={onDragStart}
        title={description}
      >
        <span className="l2-palette-item-head">
          <span className="l2-palette-item-label">{label}</span>
          {badge ? <span className="l2-palette-item-badge">{badge}</span> : null}
        </span>
        <span className="l2-palette-item-desc">{description}</span>
      </button>
    </li>
  )
}

export function L2NodePalette({ onPick, itemFilter, nativeOnly = false, feedSources }: Props) {
  const [source, setSource] = useState<PaletteSourceId>('native')
  const [activeNativeSection, setActiveNativeSection] = useState<PaletteCategory>('structure')
  const [collectionSection, setCollectionSection] = useState<CollectionSectionId>('saved_blocks')
  const [subscriptionSection, setSubscriptionSection] =
    useState<SubscriptionSectionId>('logic_blocks')
  const [search, setSearch] = useState('')
  const [collectionBlocks, setCollectionBlocks] = useState<LogicBlockPackage[]>([])
  const [subscriptionBlocks, setSubscriptionBlocks] = useState<
    Array<{ package: LogicBlockPackage; versionPin: string }>
  >([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  const catalogRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Partial<Record<PaletteCategory, HTMLElement>>>({})

  useEffect(() => {
    setCatalogLoading(true)
    void Promise.all([
      api.listLogicBlockCollection().then((r) => setCollectionBlocks(r.packages)).catch(() => setCollectionBlocks([])),
      api
        .listLogicBlockSubscriptions()
        .then((r) =>
          setSubscriptionBlocks(
            r.subscriptions.map((s) => ({ package: s.package, versionPin: s.versionPin })),
          ),
        )
        .catch(() => setSubscriptionBlocks([])),
    ]).finally(() => setCatalogLoading(false))
  }, [])

  const searchQ = search.trim().toLowerCase()

  const nativeByCategory = useMemo(() => {
    const map = new Map<PaletteCategory, PaletteItem[]>()
    for (const cat of PALETTE_CATEGORIES) {
      const items = PALETTE_ITEMS.filter((i) => {
        if (itemFilter && !itemFilter(i)) return false
        if (i.category !== cat.id) return false
        if (!searchQ) return true
        return (
          matchesSearch(i.label, searchQ) ||
          matchesSearch(i.description, searchQ) ||
          matchesSearch(cat.title, searchQ)
        )
      })
      if (items.length > 0) map.set(cat.id, items)
    }
    return map
  }, [searchQ, itemFilter])

  const scrollToNativeSection = useCallback((catId: PaletteCategory) => {
    setActiveNativeSection(catId)
    sectionRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const pickNative = useCallback(
    (item: PaletteItem) => onPick({ kind: 'native', item }),
    [onPick],
  )

  const pickLogicBlock = useCallback(
    (entry: PaletteLogicBlockEntry) => onPick({ kind: 'logic_block', entry }),
    [onPick],
  )

  const bindNativeDrag = (item: PaletteItem) => (e: React.DragEvent) => {
    if (!item.factory) return
    const { mime, data } = paletteDragPayload({ kind: 'native', item })
    e.dataTransfer.setData(mime, data)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const bindLogicBlockDrag = (entry: PaletteLogicBlockEntry) => (e: React.DragEvent) => {
    const { mime, data } = paletteDragPayload({ kind: 'logic_block', entry })
    e.dataTransfer.setData(mime, data)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const filteredCollection = useMemo(() => {
    if (collectionSection !== 'saved_blocks') return []
    return collectionBlocks.filter((pkg) => {
      if (!searchQ) return true
      const hay = `${pkg.name} ${pkg.description ?? ''} ${pkg.slug}`
      return matchesSearch(hay, searchQ)
    })
  }, [collectionBlocks, collectionSection, searchQ])

  const filteredSubscriptions = useMemo(() => {
    if (subscriptionSection === 'custom_code') return []
    return subscriptionBlocks.filter(({ package: pkg, versionPin }) => {
      if (!searchQ) return true
      const hay = `${pkg.name} ${pkg.description ?? ''} v${versionPin}`
      return matchesSearch(hay, searchQ)
    })
  }, [subscriptionBlocks, subscriptionSection, searchQ])

  const toLogicEntry = (
    pkg: LogicBlockPackage,
    versionPin: string,
    provenance: PaletteLogicBlockEntry['provenance'],
  ): PaletteLogicBlockEntry => ({
    kind: 'logic_block',
    packageId: pkg.id,
    versionPin,
    name: pkg.name,
    description: pkg.description,
    provenance,
    visibility: pkg.visibility,
  })

  return (
    <div className="l2-palette-shell">
      <nav className="l2-palette-seeker" aria-label="Node sources">
        <div className="l2-palette-seeker-block l2-palette-seeker-block-native">
          <span className="l2-palette-seeker-title">Native</span>
          <ul className="l2-palette-seeker-list">
            {PALETTE_CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <button
                  type="button"
                  className={`l2-palette-seeker-item${source === 'native' && activeNativeSection === cat.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSource('native')
                    scrollToNativeSection(cat.id)
                  }}
                >
                  {cat.title}
                </button>
              </li>
            ))}
            {feedSources && feedSources.length > 0 && (
              <li>
                <button
                  type="button"
                  className={`l2-palette-seeker-item${source === 'native' && activeNativeSection === ('sources' as PaletteCategory) ? ' is-active' : ''}`}
                  onClick={() => {
                    setSource('native')
                    setActiveNativeSection('sources' as PaletteCategory)
                    // Scroll to sources section
                    const el = catalogRef.current?.querySelector('.l2-palette-section-sources')
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  Sources
                </button>
              </li>
            )}
          </ul>
        </div>

        {!nativeOnly ? (
        <>
        <div className="l2-palette-seeker-block l2-palette-seeker-block-divider">
          <span className="l2-palette-seeker-title">My collection</span>
          <ul className="l2-palette-seeker-list">
            <li>
              <button
                type="button"
                className={`l2-palette-seeker-item${source === 'collection' && collectionSection === 'saved_blocks' ? ' is-active' : ''}`}
                onClick={() => {
                  setSource('collection')
                  setCollectionSection('saved_blocks')
                }}
              >
                Saved blocks
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`l2-palette-seeker-item${source === 'collection' && collectionSection === 'custom_code' ? ' is-active' : ''}`}
                onClick={() => {
                  setSource('collection')
                  setCollectionSection('custom_code')
                }}
              >
                Custom code
              </button>
            </li>
          </ul>
        </div>

        <div className="l2-palette-seeker-block l2-palette-seeker-block-divider">
          <span className="l2-palette-seeker-title">Subscriptions</span>
          <ul className="l2-palette-seeker-list">
            {(
              [
                ['logic_blocks', 'Logic blocks'],
                ['custom_code', 'Custom code'],
              ] as const
            ).map(([id, label]) => (
              <li key={id}>
                <button
                  type="button"
                  className={`l2-palette-seeker-item${source === 'subscriptions' && subscriptionSection === id ? ' is-active' : ''}`}
                  onClick={() => {
                    setSource('subscriptions')
                    setSubscriptionSection(id)
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        </>
        ) : null}
      </nav>

      <aside className="l2-visual-palette">
        <div className="l2-visual-palette-sticky">
          <div className="l2-visual-palette-head">
            <h3>
              {source === 'native'
                ? 'Native nodes'
                : source === 'collection'
                  ? 'My collection'
                  : 'Subscriptions'}
            </h3>
          </div>

          <label className="l2-palette-search">
            <span className="sr-only">Search nodes</span>
            <input
              type="search"
              className="input input-sm l2-palette-search-input"
              placeholder="Searchâ€¦"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="l2-palette-catalog-body" ref={catalogRef}>

        {catalogLoading && source !== 'native' ? (
          <p className="card-hint">Loadingâ€¦</p>
        ) : null}

        {source === 'native' ? (
          <>
            {nativeByCategory.size === 0 ? (
              <p className="card-hint">No nodes match your search.</p>
            ) : (
              PALETTE_CATEGORIES.map((cat) => {
                const items = nativeByCategory.get(cat.id)
                if (!items?.length) return null
                return (
                  <div
                    key={cat.id}
                    className="l2-palette-section"
                    ref={(el) => {
                      sectionRefs.current[cat.id] = el ?? undefined
                    }}
                  >
                    <h4>{cat.title}</h4>
                    <ul className="l2-palette-list">
                      {items.map((item) => (
                        <PaletteNodeButton
                          key={item.id}
                          label={item.label}
                          description={item.description}
                          draggable={Boolean(item.factory)}
                          onClick={() => pickNative(item)}
                          onDragStart={bindNativeDrag(item)}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })
            )}
            {feedSources && feedSources.length > 0 && (
              <div className="l2-palette-section l2-palette-section-sources">
                <h4>Sources</h4>
                <ul className="l2-palette-list">
                  {feedSources.map((src, i) => {
                    const sourceId = `source-${i}`
                    const label = src.type === 'feed' ? src.feedId : src.type === 'project_pool' ? src.projectId : `${src.uris.length} URIs`
                    const desc = src.type === 'feed' ? 'Feed candidates' : src.type === 'project_pool' ? 'Project pool' : 'Static URI list'
                    const entry = { kind: 'source' as const, sourceId, sourceType: src.type, label, description: desc }
                    return (
                      <PaletteNodeButton
                        key={sourceId}
                        label={label}
                        description={desc}
                        draggable
                        onClick={() => onPick({ kind: 'source', entry })}
                        onDragStart={(e) => {
                          const { mime, data } = paletteDragPayload({ kind: 'source', entry })
                          e.dataTransfer.setData(mime, data)
                        }}
                      />
                    )
                  })}
                </ul>
                <p className="card-hint">Configure sources on the Sources tab.</p>
              </div>
            )}
          </>
        ) : null}

        {source === 'collection' && collectionSection === 'saved_blocks' ? (
          <>
            {filteredCollection.length === 0 ? (
              <p className="card-hint">
                Nothing saved yet. Save a group from the inspector or create a logic block in My
                collection.
              </p>
            ) : (
              <ul className="l2-palette-list">
                {filteredCollection.map((pkg) => {
                  const entry = toLogicEntry(pkg, pkg.version, 'collection')
                  return (
                    <PaletteNodeButton
                      key={`${pkg.id}@${pkg.version}`}
                      label={pkg.name}
                      description={pkg.description ?? `Reusable logic block Â· v${pkg.version}`}
                      badge="Saved"
                      draggable
                      onClick={() => pickLogicBlock(entry)}
                      onDragStart={bindLogicBlockDrag(entry)}
                    />
                  )
                })}
              </ul>
            )}
          </>
        ) : null}

        {source === 'collection' && collectionSection === 'custom_code' ? (
          <p className="card-hint">
            Custom code logic blocks you upload will appear here. Publish WASM or worker blocks from
            My collection with a visual node definition.
          </p>
        ) : null}

        {source === 'subscriptions' && subscriptionSection === 'logic_blocks' ? (
          <>
            {filteredSubscriptions.length === 0 ? (
              <p className="card-hint">
                No subscribed logic blocks yet. Browse the marketplace and subscribe to blocks marked
                for the visual editor.
              </p>
            ) : (
              <ul className="l2-palette-list">
                {filteredSubscriptions.map(({ package: pkg, versionPin }) => {
                  const entry = toLogicEntry(pkg, versionPin, 'subscription')
                  return (
                    <PaletteNodeButton
                      key={`${pkg.id}@${versionPin}`}
                      label={pkg.name}
                      description={
                        pkg.description ?? `Subscribed logic block Â· v${versionPin}`
                      }
                      badge="Sub"
                      draggable
                      onClick={() => pickLogicBlock(entry)}
                      onDragStart={bindLogicBlockDrag(entry)}
                    />
                  )
                })}
              </ul>
            )}
          </>
        ) : null}

        {source === 'subscriptions' && subscriptionSection === 'custom_code' ? (
          <p className="card-hint">
            Subscribed custom-code logic blocks (WASM / worker) with visual editor support will
            appear here. Injectors and personalization plugins stay in feed settings â€” not on this canvas.
          </p>
        ) : null}
        </div>
      </aside>
    </div>
  )
}
