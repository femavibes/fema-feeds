import { useEffect, useState } from 'react'
import type { GlobalPurgeSettings, PurgeCondition, PurgeRule } from '@cfb/core-types'
import { api } from '../api/client'
import { ToggleRow } from './ToggleRow'

function formatCondition(c: PurgeCondition): string {
  const parts: string[] = []
  if (c.notInFeed) parts.push('not in any feed')
  if (c.isOrphan) parts.push('orphaned (0 projects)')
  if (c.postKind) parts.push(`kind = ${c.postKind}`)
  if (c.hasMedia === false) parts.push('no media')
  if (c.hasMedia === true) parts.push('has media')
  if (c.isTextOnly) parts.push('text-only')
  if (c.labeledNsfw) parts.push('labeled NSFW')
  if (c.minEditorScore !== undefined) parts.push(`editor score < ${c.minEditorScore}`)
  if (c.minLikes !== undefined) parts.push(`likes < ${c.minLikes}`)
  if (c.minReposts !== undefined) parts.push(`reposts < ${c.minReposts}`)
  if (c.minQuotes !== undefined) parts.push(`quotes < ${c.minQuotes}`)
  if (c.minReplies !== undefined) parts.push(`replies < ${c.minReplies}`)
  return parts.join(' AND ') || 'no conditions'
}

export function PurgeSettingsSection() {
  const [settings, setSettings] = useState<GlobalPurgeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sweepBusy, setSweepBusy] = useState(false)
  const [lastSweep, setLastSweep] = useState<{ scanned: number; purged: number; dryRun: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.getGlobalPurgeSettings()
      .then(({ settings: s }) => setSettings(s))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const save = async (patch: Partial<GlobalPurgeSettings>) => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const next = { ...settings, ...patch }
      const { settings: saved } = await api.saveGlobalPurgeSettings(next)
      setSettings(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const runSweep = async (dryRun: boolean) => {
    setSweepBusy(true)
    setError(null)
    try {
      const result = await api.runPurgeSweep(dryRun)
      setLastSweep(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sweep failed')
    } finally {
      setSweepBusy(false)
    }
  }

  const addRule = () => {
    if (!settings) return
    const rules = [...settings.policy.rules, { afterHours: 168 }]
    void save({ policy: { rules } })
  }

  const updateRule = (index: number, patch: Partial<PurgeRule>) => {
    if (!settings) return
    const rules = settings.policy.rules.map((r, i) => (i === index ? { ...r, ...patch } : r))
    void save({ policy: { rules } })
  }

  const removeRule = (index: number) => {
    if (!settings) return
    const rules = settings.policy.rules.filter((_, i) => i !== index)
    void save({ policy: { rules } })
  }

  const updateConditionField = (index: number, field: keyof PurgeCondition, value: number | boolean | string | undefined) => {
    if (!settings) return
    const rule = settings.policy.rules[index]
    if (!rule) return
    const condition: Record<string, unknown> = { ...rule.condition, [field]: value }
    for (const k of Object.keys(condition)) {
      const v = condition[k]
      if (v === undefined || v === false || v === '') delete condition[k]
    }
    const hasCondition = Object.keys(condition).length > 0
    updateRule(index, { condition: hasCondition ? (condition as PurgeCondition) : undefined })
  }

  if (loading) return <p className="card-hint">Loading purge settings…</p>
  if (!settings) return <p className="field-error">{error ?? 'Failed to load'}</p>

  return (
    <div className="purge-settings">
      <ToggleRow
        label="Enable automatic purge"
        checked={settings.enabled}
        onChange={(v) => void save({ enabled: v })}
        ariaLabel="Enable automatic purge"
        hint="Periodically remove old posts from the pool"
        disabled={saving}
      />

      {settings.enabled && (
        <div className="purge-settings-body">
          <label className="purge-interval-label">
            Sweep interval (minutes)
            <input
              type="number"
              min={5}
              value={settings.sweepIntervalMinutes}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 5) void save({ sweepIntervalMinutes: v })
              }}
              disabled={saving}
              className="purge-interval-input"
            />
          </label>

          <h4 className="purge-rules-heading">Purge rules</h4>
          <p className="card-hint">
            Evaluated in order — first match = purgeable. Conditions are AND (all must be true).
            Leave number fields empty for no limit. <strong>Min</strong> = post needs at least this many to survive.
          </p>

          {settings.policy.rules.map((rule, i) => (
            <div key={i} className="purge-rule-card">
              <div className="purge-rule-header">
                <label className="purge-rule-age">
                  After
                  <input
                    type="number"
                    min={1}
                    value={rule.afterHours}
                    onChange={(e) => updateRule(i, { afterHours: Number(e.target.value) || 1 })}
                    disabled={saving}
                  />
                  hours
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeRule(i)}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>

              <div className="purge-rule-conditions">
                <ToggleRow
                  label="Only if not in any feed"
                  checked={rule.condition?.notInFeed ?? false}
                  onChange={(v) => updateConditionField(i, 'notInFeed', v || undefined)}
                  ariaLabel="Only purge if not in any feed"
                  hint="Post hasn't matched any feed's L2 rules"
                  disabled={saving}
                />
                <ToggleRow
                  label="Only orphaned posts"
                  checked={rule.condition?.isOrphan ?? false}
                  onChange={(v) => updateConditionField(i, 'isOrphan', v || undefined)}
                  ariaLabel="Only purge orphaned posts"
                  hint="Post belongs to 0 projects (e.g. project was deleted)"
                  disabled={saving}
                />
                <ToggleRow
                  label="Only NSFW-labeled posts"
                  checked={rule.condition?.labeledNsfw ?? false}
                  onChange={(v) => updateConditionField(i, 'labeledNsfw', v || undefined)}
                  ariaLabel="Only purge NSFW labeled posts"
                  hint="Has porn, sexual, nudity, or graphic-media label"
                  disabled={saving}
                />
                <ToggleRow
                  label="Only text-only posts"
                  checked={rule.condition?.isTextOnly ?? false}
                  onChange={(v) => updateConditionField(i, 'isTextOnly', v || undefined)}
                  ariaLabel="Only purge text-only posts"
                  hint="No images, video, link cards, or quotes"
                  disabled={saving}
                />
                <ToggleRow
                  label="Only posts without media"
                  checked={rule.condition?.hasMedia === false}
                  onChange={(v) => updateConditionField(i, 'hasMedia', v ? false : undefined)}
                  ariaLabel="Only purge posts without media"
                  hint="No images or video attached"
                  disabled={saving}
                />

                <div className="purge-engagement-grid">
                  <label>
                    Min editor score
                    <input
                      type="number"
                      value={rule.condition?.minEditorScore ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateConditionField(i, 'minEditorScore', v ? Number(v) : undefined)
                      }}
                      disabled={saving}
                    />
                  </label>
                  <label>
                    Post kind
                    <select
                      value={rule.condition?.postKind ?? ''}
                      onChange={(e) => updateConditionField(i, 'postKind', e.target.value || undefined)}
                      disabled={saving}
                    >
                      <option value="">Any</option>
                      <option value="reply">Reply</option>
                      <option value="quote">Quote</option>
                      <option value="root">Root</option>
                    </select>
                  </label>
                  <label>
                    Min likes
                    <input
                      type="number"
                      min={0}
                      value={rule.condition?.minLikes ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateConditionField(i, 'minLikes', v ? Number(v) : undefined)
                      }}
                      disabled={saving}
                    />
                  </label>
                  <label>
                    Min reposts
                    <input
                      type="number"
                      min={0}
                      value={rule.condition?.minReposts ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateConditionField(i, 'minReposts', v ? Number(v) : undefined)
                      }}
                      disabled={saving}
                    />
                  </label>
                  <label>
                    Min quotes
                    <input
                      type="number"
                      min={0}
                      value={rule.condition?.minQuotes ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateConditionField(i, 'minQuotes', v ? Number(v) : undefined)
                      }}
                      disabled={saving}
                    />
                  </label>
                  <label>
                    Min replies
                    <input
                      type="number"
                      min={0}
                      value={rule.condition?.minReplies ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateConditionField(i, 'minReplies', v ? Number(v) : undefined)
                      }}
                      disabled={saving}
                    />
                  </label>
                </div>
              </div>

              <p className="purge-rule-summary">
                {!rule.condition
                  ? `→ Purge all posts older than ${rule.afterHours}h`
                  : `→ Purge posts older than ${rule.afterHours}h where ${formatCondition(rule.condition)}`}
              </p>
            </div>
          ))}

          {settings.policy.rules.length === 0 && (
            <p className="card-hint" style={{ fontStyle: 'italic' }}>No rules — nothing will be purged.</p>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addRule}
            disabled={saving}
            style={{ marginTop: '0.5rem' }}
          >
            + Add rule
          </button>

          {error && <p className="field-error" style={{ marginTop: '0.5rem' }}>{error}</p>}

          <div className="purge-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sweepBusy || settings.policy.rules.length === 0}
              onClick={() => void runSweep(false)}
            >
              {sweepBusy ? 'Running…' : 'Run purge now'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={sweepBusy || settings.policy.rules.length === 0}
              onClick={() => void runSweep(true)}
            >
              {sweepBusy ? 'Running…' : 'Dry run'}
            </button>
          </div>

          {lastSweep && (
            <p className="purge-sweep-result">
              {lastSweep.dryRun ? '🔍 Dry run' : '🗑️ Sweep'}: scanned {lastSweep.scanned.toLocaleString()} posts,{' '}
              {lastSweep.dryRun ? 'would purge' : 'purged'} <strong>{lastSweep.purged.toLocaleString()}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
