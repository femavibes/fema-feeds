import type { IngestStatusResponse } from '../api/client'

interface Props {
  status: IngestStatusResponse | null
  running: boolean
  busy: boolean
  error: string | null
  onToggle: () => void
  layout?: 'inline' | 'card'
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function formatDurationMs(startedAt: string, stoppedAt: string): string {
  const ms = new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  if (sec % 60 === 0) return `${sec / 60} min`
  return `${(sec / 60).toFixed(1)} min`
}

export function IngestToggle({
  status,
  running,
  busy,
  error,
  onToggle,
  layout = 'inline',
}: Props) {
  const last = status?.lastSession

  return (
    <div className={`ingest-control ${layout === 'card' ? 'ingest-control-card' : ''}`}>
      <div className="ingest-control-label">
        {layout === 'card' ? null : <span className="ingest-title">Jetstream ingest</span>}
        {status && running && (
          <span className="ingest-live-stats">
            {status.seen.toLocaleString()} seen · {status.l1Pass.toLocaleString()} passed ·{' '}
            {status.saved.toLocaleString()} saved
            {status.saveErrors > 0 && <> · {status.saveErrors} save errors</>}
            {status.enrichment.labelResolves != null && (
              <> · {status.enrichment.labelResolves} label queries</>
            )}
          </span>
        )}
        {status && !running && last && (
          <span className="ingest-last-session">
            Last session ({formatDurationMs(last.startedAt, last.stoppedAt) || '—'}):{' '}
            {last.seen.toLocaleString()} seen · {last.l1Pass.toLocaleString()} passed ·{' '}
            {last.saved.toLocaleString()} saved
            {last.saveErrors > 0 && <> · {last.saveErrors} save errors</>}
            <span className="ingest-last-session-when">
              {' '}
              · {formatWhen(last.startedAt)} → {formatWhen(last.stoppedAt)}
            </span>
          </span>
        )}
        {error && <span className="ingest-error">{error}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={running}
        aria-label={running ? 'Stop ingesting posts' : 'Start ingesting posts'}
        className={`toggle-switch ${running ? 'on' : ''} ${busy ? 'busy' : ''}`}
        disabled={busy || !status}
        onClick={() => void onToggle()}
      >
        <span className="toggle-knob" />
        <span className="toggle-text">{running ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}
