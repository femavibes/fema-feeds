import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  nodeId: string | null
  initialName: string
  onSave: (nodeId: string, name: string) => void
  onClose: () => void
}

export function L2NodeRenameDialog({ nodeId, initialName, onSave, onClose }: Props) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialName)

  useEffect(() => {
    setValue(initialName)
  }, [initialName, nodeId])

  useEffect(() => {
    if (!nodeId) return
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [nodeId])

  useEffect(() => {
    if (!nodeId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nodeId, onClose])

  if (!nodeId) return null

  const submit = () => {
    onSave(nodeId, value.trim())
    onClose()
  }

  return createPortal(
    <div
      className="l2-rename-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="l2-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>Rename node</h3>
        <p className="card-hint">Shown below the node type on the canvas. Leave empty to use the default.</p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Optional display name"
          autoComplete="off"
        />
        <div className="l2-rename-dialog-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
