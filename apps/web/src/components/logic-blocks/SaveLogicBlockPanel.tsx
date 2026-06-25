import { useState } from 'react'
import type { L2RuleGroup, LogicBlockVisibility } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  group: L2RuleGroup
  onSaved?: () => void
}

export function SaveLogicBlockPanel({ group, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(group.label ?? 'Custom logic')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<LogicBlockVisibility>('collection')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedVersion, setSavedVersion] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    setSavedVersion(null)
    try {
      const res = await api.createLogicBlock({
        name: name.trim(),
        slug: slug.trim() || name.trim(),
        description: description.trim() || undefined,
        root: structuredClone(group),
        visibility,
      })
      setSavedVersion(res.package.version)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="logic-block-save-panel">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
          Save to my collection…
        </button>
      </div>
    )
  }

  return (
    <div className="logic-block-save-panel logic-block-save-panel-open">
      <p className="logic-block-save-title">Custom graph logic</p>
      <p className="card-hint">
        Saves this group as a reusable block. Stays in your collection even after you publish to
        the marketplace.
      </p>
      <label className="l2-inspector-field">
        Name
        <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="l2-inspector-field">
        Slug
        <input
          value={slug}
          disabled={busy}
          placeholder="auto from name"
          onChange={(e) => setSlug(e.target.value)}
        />
      </label>
      <label className="l2-inspector-field">
        Description
        <input value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="l2-inspector-field">
        Visibility
        <select
          value={visibility}
          disabled={busy}
          onChange={(e) => setVisibility(e.target.value as LogicBlockVisibility)}
        >
          <option value="collection">My collection only</option>
          <option value="deployment">This deployment (live immediately; verification badge is separate)</option>
          <option value="global">Global marketplace (requires platform review)</option>
        </select>
      </label>
      {error && <p className="field-error">{error}</p>}
      {savedVersion && (
        <p className="settings-hint">Saved as v{savedVersion}. Find it under My collection in the sidebar.</p>
      )}
      <div className="logic-block-save-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save block'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}
