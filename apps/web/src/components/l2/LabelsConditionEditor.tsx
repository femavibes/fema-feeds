import { useEffect, useState } from 'react'
import type { L2LabelsCondition } from '@cfb/core-types'
import { BLUESKY_MODERATION_LABELER_DID } from '@cfb/core-types'
import type { LabelerSource } from '../../api/client'
import { api } from '../../api/client'

/** Known labels from Bluesky's official moderation labeler (Ozone). */
const BLUESKY_KNOWN_LABELS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'gore',
  'spam',
  'impersonation',
  'scam',
  'intolerant',
  'threat',
  'rude',
  'illicit',
  'security',
  'misleading',
  'inauthentic',
  'dmca-violation',
  '!no-unauthenticated',
  '!warn',
  '!hide',
  '!no-promote',
] as const

interface Props {
  node: L2LabelsCondition
  onChange: (node: L2LabelsCondition) => void
  readOnly?: boolean
}

export function LabelsConditionEditor({ node, onChange, readOnly = false }: Props) {
  const [labelers, setLabelers] = useState<LabelerSource[]>([])
  const [customInput, setCustomInput] = useState('')

  useEffect(() => {
    api.listLabelers().then((res) => setLabelers(res.labelers.filter((l) => l.enabled))).catch(() => {})
  }, [])

  const showLabelerPicker = node.scope === 'labeler'
  const selectedDids = node.labelerDids ?? []

  // Show known labels when Bluesky is relevant:
  // - scope "all" or "self" → always (Bluesky labels overlap with self-labels)
  // - scope "labeler" → only if Bluesky Moderation is among selected labelers (or none selected)
  const showKnownLabels =
    node.scope !== 'labeler' ||
    selectedDids.length === 0 ||
    selectedDids.includes(BLUESKY_MODERATION_LABELER_DID)

  const toggleLabel = (val: string) => {
    const set = new Set(node.values.map((v) => v.toLowerCase()))
    if (set.has(val.toLowerCase())) {
      onChange({ ...node, values: node.values.filter((v) => v.toLowerCase() !== val.toLowerCase()) })
    } else {
      onChange({ ...node, values: [...node.values, val] })
    }
  }

  const toggleLabelerDid = (did: string) => {
    const set = new Set(selectedDids)
    if (set.has(did)) set.delete(did)
    else set.add(did)
    const next = [...set]
    onChange({ ...node, labelerDids: next.length ? next : undefined })
  }

  const addCustomLabel = (raw: string) => {
    const val = raw.trim().toLowerCase()
    if (!val) return
    if (node.values.some((v) => v.toLowerCase() === val)) return
    onChange({ ...node, values: [...node.values, val] })
    setCustomInput('')
  }

  const removeValue = (val: string) => {
    onChange({ ...node, values: node.values.filter((v) => v !== val) })
  }

  // Custom values = values not in the known set
  const knownSet = new Set(BLUESKY_KNOWN_LABELS as unknown as string[])
  const customValues = node.values.filter((v) => !knownSet.has(v.toLowerCase()))

  return (
    <div className="l2-labels-editor">
      {showLabelerPicker && (
        <div className="l2-labels-labeler-picker">
          <span className="l2-labels-section-title">Labelers</span>
          {labelers.length === 0 && (
            <p className="l2-condition-hint">No enabled labelers configured.</p>
          )}
          <div className="l2-labels-labeler-list">
            {labelers.map((l) => (
              <label key={l.did} className="checkbox checkbox-sm">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={selectedDids.length === 0 || selectedDids.includes(l.did)}
                  onChange={() => toggleLabelerDid(l.did)}
                />
                <span>{l.name}</span>
                {l.isBuiltin && <span className="l2-labels-builtin-badge">built-in</span>}
              </label>
            ))}
          </div>
          {selectedDids.length === 0 && labelers.length > 1 && (
            <p className="l2-condition-hint">No filter — checking labels from all enabled labelers.</p>
          )}
        </div>
      )}

      {showKnownLabels && (
        <div className="l2-labels-known">
          <span className="l2-labels-section-title">Known labels</span>
          <div className="l2-labels-chip-grid">
            {BLUESKY_KNOWN_LABELS.map((label) => {
              const active = node.values.some((v) => v.toLowerCase() === label.toLowerCase())
              return (
                <button
                  key={label}
                  type="button"
                  disabled={readOnly}
                  className={`l2-labels-chip${active ? ' l2-labels-chip--active' : ''}`}
                  onClick={() => toggleLabel(label)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="l2-labels-custom">
        <span className="l2-labels-section-title">Custom labels</span>
        {customValues.length > 0 && (
          <div className="l2-labels-chip-grid">
            {customValues.map((val) => (
              <span key={val} className="l2-labels-chip l2-labels-chip--active l2-labels-chip--custom">
                {val}
                {!readOnly && (
                  <button
                    type="button"
                    className="l2-labels-chip-remove"
                    onClick={() => removeValue(val)}
                    aria-label={`Remove ${val}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="l2-labels-custom-input">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addCustomLabel(customInput)
                }
              }}
              placeholder="Type label and press Enter"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => addCustomLabel(customInput)}
              disabled={!customInput.trim()}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
