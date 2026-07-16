import { useCallback, useEffect, useState } from 'react'
import type { LogicBlockPackage, LogicBlockRef, ProjectL1Config } from '@cfb/core-types'
import { api } from '../api/client'
import { LogicBlockCreateDialog } from './logic-blocks/LogicBlockCreateDialog'
import { MarketplaceCatalogCard } from './marketplace/MarketplaceCatalogCard'

interface Props {
  draft: ProjectL1Config
  onChange: (next: ProjectL1Config) => void
  onSave?: () => Promise<void>
}

export function ProjectLogicBlocksPanel({ draft, onChange }: Props) {
  const [blocks, setBlocks] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = () => {
    api.listLogicBlockCollection()
      .then((res) => setBlocks(res.packages))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  const pinned = draft.pinnedLogicBlock

  const handlePin = useCallback(
    async (pkg: LogicBlockPackage) => {
      const ref: LogicBlockRef = { packageId: pkg.id, versionPin: pkg.version }
      const updated = { ...draft, pinnedLogicBlock: ref }
      onChange(updated)
      setSaving(true)
      try { await api.saveProject(updated) } catch {}
      setSaving(false)
    },
    [draft, onChange],
  )

  const handleUnpin = useCallback(async () => {
    const { pinnedLogicBlock: _, ...rest } = draft
    const updated = rest as ProjectL1Config
    onChange(updated)
    setSaving(true)
    try { await api.saveProject(updated) } catch {}
    setSaving(false)
  }, [draft, onChange])

  const handleCreate = async (meta: { name: string; slug: string; description: string }) => {
    setCreating(true)
    setError(null)
    try {
      await api.createLogicBlock({
        name: meta.name,
        slug: meta.slug,
        description: meta.description || undefined,
        root: { type: 'group', id: 'root', logic: 'any', children: [] },
        visibility: 'collection',
      })
      setShowCreate(false)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create logic block')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="card project-logic-blocks">
      <div className="card-head">
        <h3>Project Logic Block</h3>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate(true)}
        >
          Create new logic block
        </button>
      </div>
      <p className="card-hint">
        Pin a logic block to this project. It will be auto-inserted into new feeds
        created under this project. Pinning a new block replaces the current one.
      </p>

      {pinned && !blocks.find((b) => b.id === pinned.packageId) && !loading && (
        <div className="logic-block-card logic-block-card--missing" style={{ marginTop: '0.75rem' }}>
          <span className="field-warn">
            Pinned block <code className="mono">{pinned.packageId}</code> not found in collection
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleUnpin()}>
            Remove
          </button>
        </div>
      )}

      {loading ? (
        <p className="card-hint" style={{ marginTop: '0.75rem' }}>Loading logic blocks…</p>
      ) : blocks.length === 0 ? (
        <p className="card-hint" style={{ marginTop: '0.75rem' }}>
          No logic blocks in your collection yet. Create one above or browse the marketplace.
        </p>
      ) : (
        <div className="marketplace-catalog-grid logic-blocks-pin-grid">
          {blocks.map((pkg) => {
            const isPinned = pinned?.packageId === pkg.id
            return (
              <div key={pkg.id} className={`logic-block-pin-item${isPinned ? ' is-pinned' : ''}`}>
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
                  onClick={() => {}}
                />
                <button
                  type="button"
                  className={`btn btn-sm logic-block-pin-btn${isPinned ? ' btn-ghost' : ' btn-secondary'}`}
                  disabled={saving}
                  onClick={() => void (isPinned ? handleUnpin() : handlePin(pkg))}
                >
                  {saving ? 'Saving…' : isPinned ? '✓ Pinned — Unpin' : 'Pin to project'}
                </button>
              </div>
            )
          })}
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
