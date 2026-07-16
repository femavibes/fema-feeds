import { useCallback, useEffect, useState } from 'react'
import type { LogicBlockPackage, LogicBlockRef, ProjectL1Config } from '@cfb/core-types'
import { api } from '../api/client'

interface Props {
  draft: ProjectL1Config
  onChange: (next: ProjectL1Config) => void
}

export function ProjectLogicBlocksPanel({ draft, onChange }: Props) {
  const [blocks, setBlocks] = useState<LogicBlockPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.listLogicBlockCollection()
      .then((res) => setBlocks(res.packages))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pinned = draft.pinnedLogicBlock
  const pinnedBlock = pinned ? blocks.find((b) => b.id === pinned.packageId) : null

  const handlePin = useCallback(
    (pkg: LogicBlockPackage) => {
      const ref: LogicBlockRef = { packageId: pkg.id, versionPin: pkg.version }
      onChange({ ...draft, pinnedLogicBlock: ref })
    },
    [draft, onChange],
  )

  const handleUnpin = useCallback(() => {
    const { pinnedLogicBlock: _, ...rest } = draft
    onChange(rest as ProjectL1Config)
  }, [draft, onChange])

  return (
    <section className="card project-logic-blocks">
      <h3>Project Logic Block</h3>
      <p className="card-hint">
        Pin a logic block to this project. It will be auto-inserted into new feeds
        created under this project, so all feed variants share the same core logic.
        Users can still move or remove it from individual feeds.
      </p>

      {pinned && pinnedBlock ? (
        <div className="project-logic-blocks-pinned">
          <div className="project-logic-blocks-pinned-info">
            <strong>{pinnedBlock.name}</strong>
            <span className="mono">v{pinnedBlock.version}</span>
            {pinnedBlock.description && (
              <p className="card-hint">{pinnedBlock.description}</p>
            )}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleUnpin}
          >
            Unpin
          </button>
        </div>
      ) : pinned && !pinnedBlock && !loading ? (
        <div className="project-logic-blocks-pinned">
          <span className="field-warn">
            Pinned block <code className="mono">{pinned.packageId}</code> not found in collection
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleUnpin}>
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
              No logic blocks in your collection yet. Create one from the visual editor
              or browse the marketplace.
            </p>
          ) : (
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
                    onClick={() => handlePin(pkg)}
                  >
                    Pin to project
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
