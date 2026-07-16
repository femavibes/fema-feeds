import { useCallback, useEffect, useState } from 'react'
import type { LogicBlockPackage, LogicBlockRef, ProjectL1Config } from '@cfb/core-types'
import { api } from '../api/client'
import { LogicBlockCreateDialog } from './logic-blocks/LogicBlockCreateDialog'

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
  const pinnedBlock = pinned ? blocks.find((b) => b.id === pinned.packageId) : null

  const handlePin = useCallback(
    async (pkg: LogicBlockPackage) => {
      const ref: LogicBlockRef = { packageId: pkg.id, versionPin: pkg.version }
      const updated = { ...draft, pinnedLogicBlock: ref }
      onChange(updated)
      // Save immediately so it persists without needing manual save
      setSaving(true)
      try {
        await api.saveProject(updated)
      } catch { /* onChange already updated local state */ }
      setSaving(false)
    },
    [draft, onChange],
  )

  const handleUnpin = useCallback(async () => {
    const { pinnedLogicBlock: _, ...rest } = draft
    const updated = rest as ProjectL1Config
    onChange(updated)
    setSaving(true)
    try {
      await api.saveProject(updated)
    } catch {}
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
      <h3>Project Logic Block</h3>
      <p className="card-hint">
        Pin a logic block to this project. It will be auto-inserted into new feeds
        created under this project, so all feed variants share the same core logic.
        Users can still move or remove it from individual feeds.
      </p>

      <div className="project-logic-blocks-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate(true)}
        >
          Create new logic block
        </button>
      </div>

      {pinned && pinnedBlock ? (
        <div className="project-logic-blocks-pinned">
          <div className="project-logic-blocks-pinned-info">
            <strong>{pinnedBlock.name}</strong>
            <span className="mono"> v{pinnedBlock.version}</span>
            {pinnedBlock.description && (
              <p className="card-hint">{pinnedBlock.description}</p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => void handleUnpin()}
          >
            {saving ? 'Saving…' : 'Unpin'}
          </button>
        </div>
      ) : pinned && !pinnedBlock && !loading ? (
        <div className="project-logic-blocks-pinned">
          <span className="field-warn">
            Pinned block <code className="mono">{pinned.packageId}</code> not found in collection
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleUnpin()}>
            Remove
          </button>
        </div>
      ) : null}

      {!pinned && (
        <>
          {loading ? (
            <p className="card-hint">Loading logic blocks…</p>
          ) : blocks.length === 0 ? (
            <p className="card-hint">
              No logic blocks in your collection yet. Create one above or browse the marketplace.
            </p>
          ) : (
            <>
              <p className="card-hint" style={{ marginTop: '1rem' }}>
                Pin an existing block from your collection:
              </p>
              <ul className="project-logic-blocks-list">
                {blocks.map((pkg) => (
                  <li key={pkg.id} className="project-logic-blocks-item">
                    <div>
                      <strong>{pkg.name}</strong>
                      {pkg.description && (
                        <span className="card-hint"> — {pkg.description}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={saving}
                      onClick={() => void handlePin(pkg)}
                    >
                      {saving ? 'Saving…' : 'Pin to project'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
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
