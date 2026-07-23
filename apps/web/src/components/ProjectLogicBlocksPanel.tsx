import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LogicBlockPackage, LogicBlockRef, ProjectL1Config } from '@cfb/core-types'
import {
  isProjectLogicBlockPinned,
  pinProjectLogicBlock,
  projectPinnedLogicBlocks,
  unpinProjectLogicBlock,
  updatePinnedLogicBlockVersion,
} from '@cfb/core-types'
import { api } from '../api/client'
import { useCurrentUserDid } from '../hooks/useCurrentUserDid'
import { LogicBlockCreateDialog } from './logic-blocks/LogicBlockCreateDialog'
import { LogicBlockVisualEditor } from './logic-blocks/LogicBlockVisualEditor'
import { MarketplaceCatalogCard } from './marketplace/MarketplaceCatalogCard'

interface Props {
  draft: ProjectL1Config
  onChange: (next: ProjectL1Config) => void
  onSave?: () => Promise<void>
}

function sortBlocksWithPinnedFirst(
  blocks: LogicBlockPackage[],
  pinnedIds: Set<string>,
): LogicBlockPackage[] {
  return [...blocks].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 1 : 0
    const bPinned = pinnedIds.has(b.id) ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

function renderBlockCard(
  pkg: LogicBlockPackage,
  isPinned: boolean,
  onClick: () => void,
) {
  return (
    <MarketplaceCatalogCard
      id={pkg.id}
      name={pkg.name}
      description={pkg.description}
      version={pkg.version}
      visibility={pkg.visibility}
      trustTier={pkg.trustTier}
      listing={pkg.listing}
      updatedAt={pkg.updatedAt}
      productKind="logic_block"
      ownerDid={pkg.ownerDid}
      subtitle={pkg.slug}
      selected={isPinned}
      onClick={onClick}
    />
  )
}

export function ProjectLogicBlocksPanel({ draft, onChange }: Props) {
  const userDid = useCurrentUserDid()
  const [blocks, setBlocks] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingPkg, setEditingPkg] = useState<LogicBlockPackage | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    api
      .listLogicBlockCollection()
      .then((res) => setBlocks(res.packages))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pinnedRefs = useMemo(() => projectPinnedLogicBlocks(draft), [draft])
  const pinnedIds = useMemo(
    () => new Set(pinnedRefs.map((ref) => ref.packageId)),
    [pinnedRefs],
  )
  const pinnedPackages = useMemo(
    () =>
      pinnedRefs
        .map((ref) => blocks.find((block) => block.id === ref.packageId))
        .filter((block): block is LogicBlockPackage => Boolean(block)),
    [blocks, pinnedRefs],
  )
  const missingPinnedRefs = useMemo(
    () => pinnedRefs.filter((ref) => !blocks.some((block) => block.id === ref.packageId)),
    [blocks, pinnedRefs],
  )
  const sortedBlocks = useMemo(
    () => sortBlocksWithPinnedFirst(blocks, pinnedIds),
    [blocks, pinnedIds],
  )

  const persistProject = useCallback(
    async (next: ProjectL1Config) => {
      onChange(next)
      setSaving(true)
      try {
        await api.saveProject(next)
      } catch {
        /* ignore */
      }
      setSaving(false)
    },
    [onChange],
  )

  const handlePin = useCallback(
    async (pkg: LogicBlockPackage) => {
      const ref: LogicBlockRef = { packageId: pkg.id, versionPin: pkg.version }
      await persistProject(pinProjectLogicBlock(draft, ref))
    },
    [draft, persistProject],
  )

  const handleUnpin = useCallback(
    async (packageId: string) => {
      await persistProject(unpinProjectLogicBlock(draft, packageId))
    },
    [draft, persistProject],
  )

  const handleCreate = async (meta: { name: string; slug: string; description: string }) => {
    setCreating(true)
    setError(null)
    try {
      const res = await api.createLogicBlock({
        name: meta.name,
        slug: meta.slug,
        description: meta.description || undefined,
        root: { type: 'group', id: 'root', logic: 'any', children: [] },
        visibility: 'collection',
      })
      setShowCreate(false)
      refresh()
      setEditingPkg(res.package)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create logic block')
    } finally {
      setCreating(false)
    }
  }

  const handleSavedFromEditor = (pkg: LogicBlockPackage) => {
    setEditingPkg(null)
    refresh()
    if (isProjectLogicBlockPinned(draft, pkg.id)) {
      const pinnedRef = pinnedRefs.find((ref) => ref.packageId === pkg.id)
      if (pinnedRef && pinnedRef.versionPin !== pkg.version) {
        void persistProject(updatePinnedLogicBlockVersion(draft, pkg.id, pkg.version))
      }
    }
  }

  const openEditor = (pkg: LogicBlockPackage) => {
    setEditingPkg(pkg)
    setError(null)
  }

  const canEdit = (pkg: LogicBlockPackage) => Boolean(userDid && pkg.ownerDid === userDid)

  const renderBlockActions = (pkg: LogicBlockPackage, isPinned: boolean) => (
    <div className="logic-block-pin-actions">
      {canEdit(pkg) ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => openEditor(pkg)}
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        className={`btn btn-sm logic-block-pin-btn${isPinned ? ' btn-ghost' : ' btn-secondary'}`}
        disabled={saving}
        onClick={() => void (isPinned ? handleUnpin(pkg.id) : handlePin(pkg))}
      >
        {saving ? 'Saving…' : isPinned ? 'Unpin' : 'Pin to project'}
      </button>
    </div>
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

  return (
    <section className="card project-logic-blocks">
      <div className="card-head">
        <h3>Project Logic Blocks</h3>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate(true)}
        >
          Create new logic block
        </button>
      </div>
      <p className="card-hint">
        Pin one or more logic blocks to this project. Each pinned block is auto-inserted into new
        feeds created under this project as a separate OR path.
      </p>

      {missingPinnedRefs.map((ref) => (
        <div
          key={ref.packageId}
          className="logic-block-card logic-block-card--missing"
          style={{ marginTop: '0.75rem' }}
        >
          <span className="field-warn">
            Pinned block <code className="mono">{ref.packageId}</code> not found in collection
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void handleUnpin(ref.packageId)}
          >
            Remove
          </button>
        </div>
      ))}

      {loading ? (
        <p className="card-hint" style={{ marginTop: '0.75rem' }}>Loading logic blocks…</p>
      ) : blocks.length === 0 ? (
        <p className="card-hint" style={{ marginTop: '0.75rem' }}>
          No logic blocks in your collection yet. Create one above or browse the marketplace.
        </p>
      ) : (
        <div className="project-logic-blocks-list">
          {pinnedPackages.length > 0 ? (
            <div className="project-logic-blocks-pinned">
              <div className="project-logic-blocks-section-head">
                <h4>Pinned to project</h4>
                <span className="project-logic-blocks-pinned-badge">
                  {pinnedPackages.length} pinned
                </span>
              </div>
              <div className="marketplace-catalog-grid logic-blocks-pin-grid project-logic-blocks-pinned-grid">
                {pinnedPackages.map((pkg) => (
                  <div key={pkg.id} className="logic-block-pin-item is-pinned">
                    {renderBlockCard(pkg, true, () => {})}
                    {renderBlockActions(pkg, true)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {sortedBlocks.some((pkg) => !pinnedIds.has(pkg.id)) ? (
            <div className="project-logic-blocks-all">
              <h4 className="project-logic-blocks-section-head solo">
                {pinnedPackages.length > 0 ? 'All logic blocks' : 'Your logic blocks'}
              </h4>
              <div className="marketplace-catalog-grid logic-blocks-pin-grid">
                {sortedBlocks.map((pkg) => {
                  if (pinnedIds.has(pkg.id)) return null
                  return (
                    <div key={pkg.id} className="logic-block-pin-item">
                      {renderBlockCard(pkg, false, () => {})}
                      {renderBlockActions(pkg, false)}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {showCreate && (
        <LogicBlockCreateDialog
          onCancel={() => setShowCreate(false)}
          onCreate={handleCreate}
          busy={creating}
          error={error}
        />
      )}
    </section>
  )
}
