import { useState } from 'react'

interface Props {
  label: string
  itemName: string
  disabled?: boolean
  onDelete: () => Promise<void>
}

export function CollectionDeleteBar({ label, itemName, disabled, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    const ok = window.confirm(
      `Delete "${itemName}" from your collection? Feeds that still reference it will keep their settings, but the package will be gone. This cannot be undone.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    void onDelete()
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Delete failed')
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="collection-delete-bar">
      {error ? <p className="field-error collection-delete-error">{error}</p> : null}
      <button
        type="button"
        className="btn btn-danger btn-sm collection-delete-btn"
        disabled={disabled || busy}
        onClick={handleClick}
      >
        {busy ? 'Deleting…' : label}
      </button>
    </div>
  )
}
