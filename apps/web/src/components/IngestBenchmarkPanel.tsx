import { useEffect, useState } from 'react'

import {
  api,
  type IngestSmokeTestResult,
  type IngestStressTestResult,
} from '../api/client'

const PRESETS = [
  { label: '1 min', sec: 60 },
  { label: '5 min', sec: 300 },
  { label: '15 min', sec: 900 },
]

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec % 60 === 0) return `${sec / 60} min`
  return `${(sec / 60).toFixed(1)} min`
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function modeLabel(ignorePrefilters?: boolean): string {
  return ignorePrefilters ? 'no prefilters' : 'current prefilters'
}

function stressWriteSuccessPct(row: { saved: number; l1Pass: number }): string {
  return row.l1Pass > 0 ? ((row.saved / row.l1Pass) * 100).toFixed(2) : '0.00'
}

interface Props {
  ingestRunning: boolean
  initialSmoke?: IngestSmokeTestResult | null
  initialStress?: IngestStressTestResult | null
}

export function IngestBenchmarkPanel({
  ingestRunning,
  initialSmoke = null,
  initialStress = null,
}: Props) {
  const [customSec, setCustomSec] = useState('120')
  const [ignorePrefilters, setIgnorePrefilters] = useState(false)
  const [purgeAfterRun, setPurgeAfterRun] = useState(true)

  const [smokeResult, setSmokeResult] = useState<IngestSmokeTestResult | null>(initialSmoke)
  const [smokeHistory, setSmokeHistory] = useState<IngestSmokeTestResult[]>([])
  const [smokeLoading, setSmokeLoading] = useState(false)
  const [smokeError, setSmokeError] = useState<string | null>(null)
  const [smokeRemaining, setSmokeRemaining] = useState<number | null>(null)

  const [stressResult, setStressResult] = useState<IngestStressTestResult | null>(initialStress)
  const [stressHistory, setStressHistory] = useState<IngestStressTestResult[]>([])
  const [stressLoading, setStressLoading] = useState(false)
  const [stressError, setStressError] = useState<string | null>(null)
  const [stressRemaining, setStressRemaining] = useState<number | null>(null)
  const [purgeLoading, setPurgeLoading] = useState(false)
  const [purgeError, setPurgeError] = useState<string | null>(null)

  const busy = smokeLoading || stressLoading || purgeLoading

  const refreshSmokeHistory = async () => {
    try {
      const res = await api.ingestSmokeTests(8)
      setSmokeHistory(res.tests)
    } catch {
      // optional
    }
  }

  const refreshStressHistory = async () => {
    try {
      const res = await api.ingestStressTests(8)
      setStressHistory(res.tests)
    } catch {
      // optional
    }
  }

  useEffect(() => {
    if (initialSmoke) setSmokeResult(initialSmoke)
    if (initialStress) setStressResult(initialStress)
  }, [initialSmoke, initialStress])

  useEffect(() => {
    void refreshSmokeHistory()
    void refreshStressHistory()
  }, [])

  const runTimed = async (
    durationSec: number,
    kind: 'smoke' | 'stress',
  ) => {
    const setLoading = kind === 'smoke' ? setSmokeLoading : setStressLoading
    const setError = kind === 'smoke' ? setSmokeError : setStressError
    const setResult = kind === 'smoke' ? setSmokeResult : setStressResult
    const setRemaining = kind === 'smoke' ? setSmokeRemaining : setStressRemaining

    setLoading(true)
    setError(null)
    if (kind === 'stress') setPurgeError(null)
    setResult(null)
    setRemaining(durationSec)

    const tick = setInterval(() => {
      setRemaining((r) => (r !== null && r > 0 ? r - 1 : r))
    }, 1000)

    try {
      if (kind === 'smoke') {
        const res = await api.ingestSmokeTest(durationSec, ignorePrefilters)
        setSmokeResult(res)
        await refreshSmokeHistory()
      } else {
        const res = await api.ingestStressTest(durationSec, ignorePrefilters)
        let final = res
        if (
          purgeAfterRun &&
          res.id &&
          (res.trackablePosts ?? 0) > 0 &&
          !res.purgedAt
        ) {
          try {
            const purged = await api.purgeIngestStressTest(res.id)
            final = purged.stressTest
          } catch (e) {
            setPurgeError(e instanceof Error ? e.message : 'Auto-purge failed')
          }
        }
        setStressResult(final)
        await refreshStressHistory()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `${kind} test failed`)
    } finally {
      clearInterval(tick)
      setRemaining(null)
      setLoading(false)
    }
  }

  const purgeStressRun = async () => {
    if (!stressResult?.id) return
    const trackable = stressResult.trackablePosts ?? stressResult.saved
    const msg = stressResult.ignorePrefilters
      ? `Remove ${trackable.toLocaleString()} benchmark posts from the pool? This deletes only project tags written during this run, then drops posts with no remaining tags.`
      : `Remove pool writes from this stress run? Project tags added during the run will be removed; posts that still belong to other projects stay.`
    if (!window.confirm(msg)) return

    setPurgeLoading(true)
    setPurgeError(null)
    try {
      const res = await api.purgeIngestStressTest(stressResult.id)
      setStressResult(res.stressTest)
      await refreshStressHistory()
    } catch (e) {
      setPurgeError(e instanceof Error ? e.message : 'Purge failed')
    } finally {
      setPurgeLoading(false)
    }
  }

  const presetButtons = (kind: 'smoke' | 'stress') => (
    <div className="dry-run-presets">
      {PRESETS.map((p) => (
        <button
          key={`${kind}-${p.sec}`}
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || ingestRunning}
          onClick={() => void runTimed(p.sec, kind)}
        >
          {p.label}
        </button>
      ))}
      <div className="dry-run-custom">
        <input
          type="number"
          min={10}
          max={1800}
          value={customSec}
          disabled={busy}
          onChange={(e) => setCustomSec(e.target.value)}
          aria-label="Custom benchmark duration in seconds"
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || ingestRunning}
          onClick={() => {
            const sec = Number.parseInt(customSec, 10)
            if (Number.isFinite(sec)) void runTimed(sec, kind)
          }}
        >
          Run
        </button>
      </div>
    </div>
  )

  return (
    <div className="ingest-benchmark">
      <label className="ingest-benchmark-mode">
        <input
          type="checkbox"
          checked={ignorePrefilters}
          disabled={busy || ingestRunning}
          onChange={(e) => setIgnorePrefilters(e.target.checked)}
        />
        Ignore project prefilters (permissive pool — every enabled project accepts all posts)
      </label>

      {ingestRunning && (
        <p className="field-error">Stop live ingest before running a benchmark.</p>
      )}

      <section className="settings-section ingest-smoke-test">
        <h3 className="settings-section-title">Smoke test (no writes)</h3>
        <p className="card-hint">
          Sample Jetstream receive rate and filter CPU for{' '}
          <strong>{modeLabel(ignorePrefilters)}</strong>. Nothing is saved — use this to see
          firehose volume and pass rate without touching Postgres.
        </p>
        {presetButtons('smoke')}
        {smokeLoading && smokeRemaining !== null && (
          <p className="dry-run-progress">Sampling… ~{formatDuration(smokeRemaining)} left</p>
        )}
        {smokeError && <p className="field-error">{smokeError}</p>}
        {smokeResult && (
          <div className="dry-run-results">
            <p className="dry-run-headline">
              <strong>{smokeResult.wouldSave.toLocaleString()}</strong> would save ·{' '}
              <strong>{smokeResult.seen.toLocaleString()}</strong> seen in{' '}
              {formatDuration(smokeResult.durationSec)}
            </p>
            <p className="dry-run-sub">
              {smokeResult.postsPerSec} posts/sec · {smokeResult.passRatePct}% pass ·{' '}
              {modeLabel(smokeResult.ignorePrefilters)}
            </p>
            <p className="card-hint">
              Finished {formatWhen(smokeResult.finishedAt)} · no pool writes
            </p>
          </div>
        )}
        {smokeHistory.length > 0 && (
          <div className="ingest-smoke-history">
            <p className="card-hint">Recent smoke runs</p>
            <ul>
              {smokeHistory.map((row) => (
                <li key={row.id ?? row.finishedAt}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm ingest-smoke-history-row"
                    onClick={() => setSmokeResult(row)}
                  >
                    {formatWhen(row.finishedAt)} · {row.seen.toLocaleString()} seen ·{' '}
                    {row.wouldSave.toLocaleString()} would save · {row.postsPerSec}/s
                    {row.ignorePrefilters ? ' · no prefilters' : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="settings-section ingest-stress-test">
        <h3 className="settings-section-title">Stress test (writes to pool)</h3>
        <p className="card-hint">
          Same Jetstream sample but runs real <code>persistL1Matches</code> writes for{' '}
          <strong>{modeLabel(ignorePrefilters)}</strong>. Skips enrichment and L2 so you
          isolate ingest + Postgres throughput.
        </p>
        <label className="ingest-benchmark-mode">
          <input
            type="checkbox"
            checked={purgeAfterRun}
            disabled={busy || ingestRunning}
            onChange={(e) => setPurgeAfterRun(e.target.checked)}
          />
          Purge pool writes when run finishes (removes posts written during this benchmark)
        </label>
        <p className="card-hint">
          When off, posts stay in the pool until you purge a run manually or normal TTL applies.
          With <strong>current prefilters</strong>, purge only removes project tags this run
          newly added; with <strong>no prefilters</strong>, purge clears benchmark tags from
          enabled projects.
        </p>
        {presetButtons('stress')}
        {stressLoading && stressRemaining !== null && (
          <p className="dry-run-progress">Writing to pool… ~{formatDuration(stressRemaining)} left</p>
        )}
        {stressError && <p className="field-error">{stressError}</p>}
        {stressResult && (
          <div className="dry-run-results">
            <p className="dry-run-headline">
              <strong>{stressResult.saved.toLocaleString()}</strong> saved ·{' '}
              <strong>{stressResult.l1Pass.toLocaleString()}</strong> matched ·{' '}
              <strong>{stressResult.seen.toLocaleString()}</strong> seen ·{' '}
              {stressResult.saveErrors > 0 && (
                <>
                  <strong className="field-error">{stressResult.saveErrors}</strong> save errors ·{' '}
                </>
              )}
              {stressResult.backlog > 0 && (
                <>
                  <strong>{stressResult.backlog}</strong> backlog ·{' '}
                </>
              )}
              {formatDuration(stressResult.durationSec)}
            </p>
            <p className="dry-run-sub">
              {stressResult.postsPerSec} posts/sec in · {stressResult.savesPerSec} saves/sec ·{' '}
              {stressWriteSuccessPct(stressResult)}% write success ·{' '}
              {stressResult.passRatePct}% L1 pass · {modeLabel(stressResult.ignorePrefilters)}
            </p>
            <p className="card-hint">
              <strong>Matched</strong> = posts L1 said should be saved.{' '}
              <strong>Write success</strong> = matched posts that reached Postgres (
              {stressResult.saved.toLocaleString()}/{stressResult.l1Pass.toLocaleString()}).
              Filtered posts (seen − matched) are expected when prefilters are on.
            </p>
            {stressResult.saved < stressResult.l1Pass && (
              <p className="field-error">
                Writes lagged behind matches — Postgres or disk may be the bottleneck.
              </p>
            )}
            {Object.keys(stressResult.byProject).length > 0 && (
              <div className="dry-run-rejects">
                <p className="card-hint">
                  {stressResult.ignorePrefilters
                    ? 'Tagged per project (same posts on each enabled project)'
                    : 'Matched by project'}
                </p>
                <ul>
                  {Object.entries(stressResult.byProject)
                    .sort((a, b) => b[1] - a[1])
                    .map(([projectId, n]) => (
                      <li key={projectId}>
                        <code>{projectId}</code>: {n.toLocaleString()}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {stressResult.purgedAt ? (
              <p className="card-hint">
                Purged {formatWhen(stressResult.purgedAt)}
                {stressResult.purgedPosts != null
                  ? ` · ${stressResult.purgedPosts.toLocaleString()} posts removed from pool`
                  : ''}
              </p>
            ) : stressResult.id && (stressResult.trackablePosts ?? 0) > 0 ? (
              <div className="ingest-stress-purge">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy || ingestRunning}
                  onClick={() => void purgeStressRun()}
                >
                  Purge posts from this run
                </button>
              </div>
            ) : stressResult.id && stressResult.saved > 0 ? (
              <p className="card-hint">
                Purge unavailable — this run predates post tracking. Re-run the stress test after
                restarting the API to enable purge.
              </p>
            ) : stressResult.id ? (
              <p className="card-hint">Nothing was written during this run, so there is nothing to purge.</p>
            ) : null}
            {purgeError && <p className="field-error">{purgeError}</p>}
            <p className="card-hint">Finished {formatWhen(stressResult.finishedAt)}</p>
          </div>
        )}
        {stressHistory.length > 0 && (
          <div className="ingest-smoke-history">
            <p className="card-hint">Recent stress runs</p>
            <ul>
              {stressHistory.map((row) => (
                <li key={row.id ?? row.finishedAt}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm ingest-smoke-history-row"
                    onClick={() => setStressResult(row)}
                  >
                    {formatWhen(row.finishedAt)} · {row.saved.toLocaleString()}/
                    {row.l1Pass.toLocaleString()} saved/matched · {row.savesPerSec} saves/s
                    {row.ignorePrefilters ? ' · no prefilters' : ''}
                    {stressWriteSuccessPct(row) !== '100.00'
                      ? ` · ${stressWriteSuccessPct(row)}% writes`
                      : ''}
                    {row.saveErrors > 0 ? ` · ${row.saveErrors} err` : ''}
                    {row.purgedAt ? ' · purged' : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
