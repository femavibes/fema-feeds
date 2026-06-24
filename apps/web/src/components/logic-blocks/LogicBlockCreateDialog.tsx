import { useState } from 'react'

import { LogicBlockMetadataFields } from './LogicBlockMetadataFields'

interface Props {
  onCancel: () => void
  onCreate: (meta: { name: string; slug: string; description: string }) => void
  busy?: boolean
  error?: string | null
}

export function LogicBlockCreateDialog({ onCancel, onCreate, busy = false, error }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="logic-block-create-overlay" role="dialog" aria-modal="true" aria-label="Name logic block">
      <div className="logic-block-create-dialog">
        <h2>Name your logic block</h2>
        <p className="card-hint">
          Pick a clear name — you can change it later. The slug is used internally and in marketplace URLs.
        </p>
        <LogicBlockMetadataFields
          name={name}
          slug={slug}
          description={description}
          disabled={busy}
          onNameChange={setName}
          onSlugChange={setSlug}
          onDescriptionChange={setDescription}
        />
        {error ? <p className="field-error">{error}</p> : null}
        <div className="logic-block-create-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !name.trim()}
            onClick={() =>
              onCreate({
                name: name.trim(),
                slug: slug.trim() || name.trim(),
                description: description.trim(),
              })
            }
          >
            {busy ? 'Creating…' : 'Create & open editor'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
