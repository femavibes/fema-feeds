import { useState } from 'react'
import type { L1StepId, L1ProjectResult, ProjectL1Config } from '@cfb/core-types'
import { api, type DryRunResult } from '../api/client'
import { stepLabel } from '../lib/l1-form'
import { formatL1TraceHighlight, L1TraceList } from './L1TraceList'
import { normalizePostUrlField } from '../lib/post-url'
interface Props {
  projectId: string
  draft: ProjectL1Config
  layout?: 'main' | 'sidebar'
}

const DRY_RUN_PRESETS = [
  { label: '1 min', sec: 60 },
  { label: '5 min', sec: 300 },
]

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec % 60 === 0) return `${sec / 60} min`
  return `${(sec / 60).toFixed(1)} min`
}

export function L1TestPanel({ projectId, draft, layout = 'main' }: Props) {
  const [postInput, setPostInput] = useState('')
  const [result, setResult] = useState<L1ProjectResult | null>(null)
  const [postInfo, setPostInfo] = useState<{
    uri: string
    authorDid: string
    text?: string
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [traceOpen, setTraceOpen] = useState(true)

  const [customSec, setCustomSec] = useState('120')
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null)
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunError, setDryRunError] = useState<string | null>(null)
  const [dryRunRemaining, setDryRunRemaining] = useState<number | null>(null)

  const runPreview = async () => {
    if (!postInput.trim()) {
      setPreviewError('Paste a Bluesky post URL or at:// URI')
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    setResult(null)
    try {
      let post = postInput.trim()
      try {
        const normalized = normalizePostUrlField(postInput)
        post = normalized.value
        if (normalized.extracted) setPostInput(normalized.value)
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'Invalid post link')
        return
      }
      const res = await api.preview(projectId, {
        post,
        project: draft,
      })
      setResult(res.result)
      setPostInfo(res.post)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewLoading(false)
    }
  }

  const runDryRun = async (durationSec: number) => {
    setDryRunLoading(true)
    setDryRunError(null)
    setDryRunResult(null)
    setDryRunRemaining(durationSec)

    const tick = setInterval(() => {
      setDryRunRemaining((r) => (r !== null && r > 0 ? r - 1 : r))
    }, 1000)

    try {
      const res = await api.dryRun(projectId, durationSec, draft)
      setDryRunResult(res)
    } catch (e) {
      setDryRunError(e instanceof Error ? e.message : 'Dry run failed')
    } finally {
      clearInterval(tick)
      setDryRunRemaining(null)
      setDryRunLoading(false)
    }
  }

  const isSidebar = layout === 'sidebar'

  return (
    <div className={`test-panel${isSidebar ? ' test-panel-sidebar' : ''}`}>
      <section className={isSidebar ? 'l1-test-sidebar-section' : 'card preview-card'}>
        <h3 className={isSidebar ? 'sidebar-block-title' : undefined}>Test a real post</h3>
        <p className="card-hint">
          Paste a Bluesky post URL from bsky.app (not an API path). Example:{' '}
          <code>https://bsky.app/profile/handle/post/…</code>
        </p>        <label>
          Post URL or URI
          <input
            value={postInput}
            onChange={(e) => setPostInput(e.target.value)}
            placeholder="https://bsky.app/profile/.../post/..."
          />
        </label>
        <button
          type="button"
          className={`btn btn-secondary btn-sm${isSidebar ? ' sidebar-action-btn' : ''}`}
          disabled={previewLoading || dryRunLoading}
          onClick={() => void runPreview()}
        >
          {previewLoading ? 'Fetching…' : 'Test this post'}
        </button>

        {previewError && <p className="field-error">{previewError}</p>}

        {postInfo && (
          <p className="preview-meta">
            <code>{postInfo.uri}</code> · {postInfo.authorDid}
            {postInfo.text && (
              <>
                <br />
                <span className="preview-snippet">"{postInfo.text}"</span>
              </>
            )}
          </p>
        )}

        {result && (
          <>
            <div className={`preview-verdict ${result.matched ? 'pass' : 'fail'}`}>
              {result.matched ? '✓ Would enter pool' : '✗ Would be rejected'}
              {result.matchedVia && (
                <span className="preview-via"> via {result.matchedVia}</span>
              )}
            </div>
            {formatL1TraceHighlight(result.trace, result.matched) ? (
              <p className={`l1-preview-why${result.matched ? ' l1-preview-why-pass' : ' l1-preview-why-fail'}`}>
                {result.matched ? 'Matched because: ' : 'Rejected at: '}
                <strong>{formatL1TraceHighlight(result.trace, result.matched)}</strong>
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm l1-trace-toggle"
              onClick={() => setTraceOpen((v) => !v)}
            >
              {traceOpen ? 'Hide filter trace' : 'Show full filter trace'}
            </button>
            {traceOpen ? <L1TraceList trace={result.trace} matched={result.matched} /> : null}
          </>
        )}      </section>

      <section className={isSidebar ? 'l1-test-sidebar-section' : 'card preview-card'}>
        <h3 className={isSidebar ? 'sidebar-block-title' : undefined}>Volume dry run</h3>
        <p className="card-hint">
          Listen to Jetstream for a short window. Counts how many posts would be saved for this
          project — nothing is written to the database. Stop live ingest first.
        </p>

        <div className="dry-run-presets">
          {DRY_RUN_PRESETS.map((p) => (
            <button
              key={p.sec}
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={dryRunLoading || previewLoading}
              onClick={() => void runDryRun(p.sec)}
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
              onChange={(e) => setCustomSec(e.target.value)}
              disabled={dryRunLoading}
            />
            <span>sec</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={dryRunLoading || previewLoading}
              onClick={() => void runDryRun(Number(customSec) || 60)}
            >
              Run
            </button>
          </div>
        </div>

        {dryRunLoading && dryRunRemaining !== null && (
          <p className="dry-run-progress">
            Sampling firehose… ~{formatDuration(dryRunRemaining)} left
          </p>
        )}

        {dryRunError && <p className="field-error">{dryRunError}</p>}

        {dryRunResult && (
          <div className="dry-run-results">
            <p className="dry-run-headline">
              <strong>{dryRunResult.wouldSave}</strong> posts would be saved in{' '}
              {formatDuration(dryRunResult.durationSec)}
            </p>
            <p className="dry-run-sub">
              {dryRunResult.seen.toLocaleString()} posts seen · {dryRunResult.passRatePct}% pass
              rate for <em>{dryRunResult.projectId}</em>
            </p>
            {Object.keys(dryRunResult.topRejectSteps).length > 0 && (
              <div className="dry-run-rejects">
                <span>Top reject steps:</span>
                <ul>
                  {Object.entries(dryRunResult.topRejectSteps).map(([step, n]) => (
                    <li key={step}>
                      {stepLabel(step as L1StepId)}: {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dryRunResult.wouldSave === 0 &&
              draft.authorsOnly &&
              (dryRunResult.topRejectSteps.author_allowlist ?? 0) > 0 && (
                <p className="field-error dry-run-hint">
                  Authors only is on and almost everything failed at author allowlist. Add a Bluesky list
                  URL (poll lists) or turn off Authors only for discovery-style feeds. Listed authors
                  auto-save by default unless you require extra filters under their list.
                </p>
              )}
            <p className="card-hint">
              Extrapolate roughly: ~{Math.round(dryRunResult.wouldSave * (3600 / dryRunResult.durationSec))}/hour
              at current firehose rates (very approximate).
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
