import { useEffect, useState } from 'react'
import type { BackfillJob, BackfillJobConfig, BackfillMethod, BackfillSettings } from '@cfb/core-types'
import { DEFAULT_BACKFILL_SETTINGS } from '@cfb/core-types'
import { api } from '../api/client'

interface Props {
  projectId: string
  poolSize?: number
}

const PRESETS = [
  { label: 'Quick taste', candidates: 5_000, matches: 500 },
  { label: 'Standard', candidates: 25_000, matches: 2_500 },
  { label: 'Deep', candidates: 50_000, matches: 5_000 },
] as const

export function ProjectBackfill({ projectId, poolSize }: Props) {
  const [settings, setSettings] = useState<BackfillSettings>(DEFAULT_BACKFILL_SETTINGS)
  const [jobs, setJobs] = useState<BackfillJob[]>([])
  const [tab, setTab] = useState<BackfillMethod>('jetstream')
  const [candidateLimit, setCandidateLimit] = useState(25_000)
  const [matchLimit, setMatchLimit] = useState(2_500)
  const [hoursBack, setHoursBack] = useState(24)
  const [queries, setQueries] = useState<string[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.getBackfillSettings().then(r => setSettings(r.settings)).catch(() => {})
    loadJobs()
    api.suggestBackfillQueries(projectId).then(r => {
      if (r.queries.length) setQueries(r.queries)
    }).catch(() => {})
  }, [projectId])

  // Poll active jobs
  useEffect(() => {
    const active = jobs.find(j => j.status === 'running' || j.status === 'queued')
    if (active && !polling) {
      const timer = setInterval(loadJobs, 3000)
      setPolling(timer)
    } else if (!active && polling) {
      clearInterval(polling)
      setPolling(null)
    }
    return () => { if (polling) clearInterval(polling) }
  }, [jobs])

  const loadJobs = () => {
    api.listBackfillJobs(projectId).then(r => setJobs(r.jobs)).catch(() => {})
  }

  const activeJob = jobs.find(j => j.status === 'running' || j.status === 'queued')

  const applyPreset = (p: typeof PRESETS[number]) => {
    setCandidateLimit(Math.min(p.candidates, settings.maxCandidatesPerRun))
    setMatchLimit(Math.min(p.matches, settings.maxMatchesPerRun))
  }

  const start = async () => {
    setStarting(true)
    setError(null)
    const config: BackfillJobConfig = {
      method: tab,
      candidateLimit: Math.min(candidateLimit, settings.maxCandidatesPerRun),
      matchLimit: Math.min(matchLimit, settings.maxMatchesPerRun),
    }
    if (tab === 'jetstream') config.hoursBack = hoursBack
    if (tab === 'search') config.queries = queries.length ? queries : undefined
    try {
      await api.startBackfill(projectId, config)
      loadJobs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start backfill')
    } finally {
      setStarting(false)
    }
  }

  const cancel = async (jobId: string) => {
    await api.cancelBackfill(projectId, jobId).catch(() => {})
    loadJobs()
  }

  const enabledMethods = settings.enabledMethods
  const availableTabs = (['jetstream', 'search', 'author'] as const).filter(m => enabledMethods.includes(m))

  if (availableTabs.length === 0) {
    return <p className="card-hint">Backfill is disabled by the deployment master.</p>
  }

  return (
    <div className="backfill-section">
      {poolSize !== undefined && (
        <p className="card-hint" style={{ marginBottom: '0.5rem' }}>
          Pool has <strong>{poolSize.toLocaleString()}</strong> posts. Backfill to add historical posts matching your prefilter.
        </p>
      )}

      {/* Active job progress */}
      {activeJob && (
        <div className="backfill-progress" style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>
              {activeJob.status === 'running' ? '⏳ Running' : '⏸ Queued'} — {activeJob.method}
            </strong>
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => cancel(activeJob.id)}>
              Cancel
            </button>
          </div>
          {activeJob.status === 'running' && (
            <>
              <div className="backfill-progress-bar" style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div style={{
                  height: '100%',
                  background: 'var(--primary, #3b82f6)',
                  width: `${Math.min(100, Math.max(activeJob.candidatesScanned / activeJob.candidateLimit, activeJob.matchesFound / activeJob.matchLimit) * 100)}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>Scanned: {activeJob.candidatesScanned.toLocaleString()} / {activeJob.candidateLimit.toLocaleString()}</span>
                <span>Matched: {activeJob.matchesFound.toLocaleString()} / {activeJob.matchLimit.toLocaleString()}</span>
                <span>Feed candidates: {activeJob.l2Written.toLocaleString()}</span>
                {activeJob.errors > 0 && <span style={{ color: 'var(--danger)' }}>Errors: {activeJob.errors}</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Method tabs */}
      {!activeJob && (
        <>
          <div className="bluesky-feeds-tabs" style={{ marginBottom: '0.75rem' }}>
            {availableTabs.map(m => (
              <button
                key={m}
                type="button"
                className={`bluesky-feeds-tab${tab === m ? ' active' : ''}`}
                onClick={() => setTab(m)}
              >
                {m === 'jetstream' ? 'Jetstream Replay' : m === 'search' ? 'Bluesky Search' : 'Author Crawl'}
              </button>
            ))}
          </div>

          {/* Method description */}
          {tab === 'jetstream' && (
            <p className="card-hint">
              Replay the Bluesky firehose from up to {settings.jetstream.maxHoursBack}h ago.
              All posts run through your L1 prefilter — matches land in the pool.
            </p>
          )}
          {tab === 'search' && (
            <p className="card-hint">
              Search Bluesky for posts matching keywords/hashtags. Results run through your L1 prefilter.
              Can reach posts weeks or months old.
            </p>
          )}
          {tab === 'author' && (
            <p className="card-hint">
              Crawl recent posts from authors in your project's author lists.
              Can reach months of history per author.
            </p>
          )}

          {/* Method-specific config */}
          {tab === 'jetstream' && (
            <div style={{ margin: '0.75rem 0' }}>
              <label style={{ fontSize: '0.8rem' }}>
                Time range
                <select
                  value={hoursBack}
                  onChange={e => setHoursBack(Number(e.target.value))}
                  style={{ marginLeft: '0.5rem' }}
                >
                  <option value={6}>Last 6 hours</option>
                  <option value={12}>Last 12 hours</option>
                  <option value={24}>Last 24 hours</option>
                  <option value={48}>Last 48 hours</option>
                  {settings.jetstream.maxHoursBack >= 72 && <option value={72}>Last 72 hours</option>}
                </select>
              </label>
            </div>
          )}

          {tab === 'search' && (
            <div style={{ margin: '0.75rem 0' }}>
              <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>
                Search queries (one per line or comma-separated)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  value={queryInput}
                  onChange={e => setQueryInput(e.target.value)}
                  placeholder="keyword or #hashtag"
                  style={{ flex: 1 }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && queryInput.trim()) {
                      setQueries(prev => [...prev, queryInput.trim()])
                      setQueryInput('')
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={!queryInput.trim()}
                  onClick={() => { setQueries(prev => [...prev, queryInput.trim()]); setQueryInput('') }}
                >
                  Add
                </button>
              </div>
              {queries.length > 0 && (
                <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                  {queries.map((q, i) => (
                    <span key={i} className="badge badge-muted" style={{ cursor: 'pointer' }} onClick={() => setQueries(prev => prev.filter((_, j) => j !== i))}>
                      {q} ×
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Limits */}
          <div style={{ margin: '0.75rem 0' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => applyPreset(p)}
                  style={{ fontSize: '0.7rem' }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="settings-field-grid" style={{ gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem' }}>
                Stop after scanning
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  max={settings.maxCandidatesPerRun}
                  value={candidateLimit}
                  onChange={e => setCandidateLimit(Number(e.target.value))}
                />
                <span className="card-hint" style={{ fontSize: '0.7rem' }}>max {settings.maxCandidatesPerRun.toLocaleString()}</span>
              </label>
              <label style={{ fontSize: '0.8rem' }}>
                Stop after saving
                <input
                  type="number"
                  min={100}
                  step={100}
                  max={settings.maxMatchesPerRun}
                  value={matchLimit}
                  onChange={e => setMatchLimit(Number(e.target.value))}
                />
                <span className="card-hint" style={{ fontSize: '0.7rem' }}>max {settings.maxMatchesPerRun.toLocaleString()}</span>
              </label>
            </div>
            <p className="card-hint" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>Whichever limit is hit first stops the run.</p>
          </div>

          {error && <p className="field-error">{error}</p>}

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={starting || (tab === 'search' && queries.length === 0)}
            onClick={start}
          >
            {starting ? 'Starting…' : 'Start Backfill'}
          </button>
        </>
      )}

      {/* Job history */}
      {jobs.length > 0 && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Recent runs</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {jobs.filter(j => j.status !== 'queued').slice(0, 5).map(j => (
              <div key={j.id} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span className={`badge ${j.status === 'completed' ? 'badge-muted' : j.status === 'failed' ? 'badge-danger' : ''}`} style={{ fontSize: '0.65rem', marginRight: '0.5rem' }}>
                  {j.status}
                </span>
                {j.method} — {j.candidatesScanned.toLocaleString()} scanned, {j.matchesFound.toLocaleString()} pooled, {j.l2Written.toLocaleString()} candidates
                {j.finishedAt && <span> · {new Date(j.finishedAt).toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
