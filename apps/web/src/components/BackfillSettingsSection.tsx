import { useEffect, useState } from 'react'
import type { BackfillSettings } from '@cfb/core-types'
import { DEFAULT_BACKFILL_SETTINGS } from '@cfb/core-types'
import { api } from '../api/client'

export function BackfillSettingsSection() {
  const [settings, setSettings] = useState<BackfillSettings>(DEFAULT_BACKFILL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getBackfillSettings().then(r => setSettings(r.settings)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const save = async (patch: Partial<BackfillSettings>) => {
    setSaving(true)
    try {
      const res = await api.saveBackfillSettings(patch)
      setSettings(res.settings)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="card-hint">Loading backfill settings…</p>

  return (
    <section className="settings-section">
      <p className="card-hint">
        Deployment-wide limits for pool backfill. Users can run backfill up to these ceilings.
        Whichever limit is hit first (candidates scanned or matches saved) stops the run.
      </p>

      <div className="settings-field-grid" style={{ gap: '0.5rem' }}>
        <label>
          Max candidates scanned per run
          <input
            type="number"
            min={1000}
            step={1000}
            value={settings.maxCandidatesPerRun}
            onChange={e => void save({ maxCandidatesPerRun: Number(e.target.value) })}
            disabled={saving}
          />
        </label>
        <label>
          Max matches saved per run
          <input
            type="number"
            min={100}
            step={100}
            value={settings.maxMatchesPerRun}
            onChange={e => void save({ maxMatchesPerRun: Number(e.target.value) })}
            disabled={saving}
          />
        </label>
        <label>
          Max concurrent backfill jobs
          <input
            type="number"
            min={1}
            max={5}
            value={settings.maxConcurrentBackfills}
            onChange={e => void save({ maxConcurrentBackfills: Number(e.target.value) })}
            disabled={saving}
          />
        </label>
        <label>
          Cooldown between runs (minutes)
          <input
            type="number"
            min={0}
            value={settings.cooldownMinutes}
            onChange={e => void save({ cooldownMinutes: Number(e.target.value) })}
            disabled={saving}
          />
        </label>
      </div>

      <h4 style={{ margin: '1rem 0 0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Prefilter mode</h4>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.allowManualPrefilter}
          onChange={e => void save({ allowManualPrefilter: e.target.checked })}
          disabled={saving}
        />
        Allow users to switch projects to manual prefilter mode
      </label>
      <p className="card-hint" style={{ fontSize: '0.75rem' }}>
        When disabled, all projects use strict mode (auto-derived from feeds). Manual mode lets users build custom prefilter rules.
      </p>

      <h4 style={{ margin: '1rem 0 0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Enabled methods</h4>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {(['jetstream', 'search', 'author'] as const).map(method => (
          <label key={method} className="settings-check">
            <input
              type="checkbox"
              checked={settings.enabledMethods.includes(method)}
              onChange={e => {
                const next = e.target.checked
                  ? [...settings.enabledMethods, method]
                  : settings.enabledMethods.filter(m => m !== method)
                void save({ enabledMethods: next })
              }}
              disabled={saving}
            />
            {method === 'jetstream' ? 'Jetstream replay' : method === 'search' ? 'Bluesky search' : 'Author crawl'}
          </label>
        ))}
      </div>

      <h4 style={{ margin: '1rem 0 0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Method limits</h4>
      <div className="settings-field-grid" style={{ gap: '0.5rem' }}>
        <label>
          Jetstream: max hours back
          <input
            type="number"
            min={1}
            max={72}
            value={settings.jetstream.maxHoursBack}
            onChange={e => void save({ jetstream: { maxHoursBack: Number(e.target.value) } })}
            disabled={saving}
          />
        </label>
        <label>
          Search: max pages
          <input
            type="number"
            min={1}
            max={200}
            value={settings.search.maxPages}
            onChange={e => void save({ search: { maxPages: Number(e.target.value) } })}
            disabled={saving}
          />
        </label>
        <label>
          Author crawl: max authors
          <input
            type="number"
            min={1}
            max={500}
            value={settings.author.maxAuthors}
            onChange={e => void save({ author: { ...settings.author, maxAuthors: Number(e.target.value) } })}
            disabled={saving}
          />
        </label>
        <label>
          Author crawl: max pages per author
          <input
            type="number"
            min={1}
            max={100}
            value={settings.author.maxPagesPerAuthor}
            onChange={e => void save({ author: { ...settings.author, maxPagesPerAuthor: Number(e.target.value) } })}
            disabled={saving}
          />
        </label>
      </div>
    </section>
  )
}
