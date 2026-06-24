import { useIngestRunner } from '../lib/use-ingest-runner'

interface Props {
  isMaster?: boolean
}

/** Compact ingest on/off control for the app header. */
export function IngestStatusPill({ isMaster = true }: Props) {
  const { running, busy, error, status, toggle } = useIngestRunner()

  const label = busy ? 'Ingest…' : running ? 'Ingest on' : 'Ingest off'
  const title = isMaster
    ? error ?? (running ? 'Ingest running — click to stop' : 'Ingest off — click to start')
    : running
      ? 'Ingest running (master controls)'
      : 'Ingest off (master controls)'

  if (!isMaster) {
    return (
      <span
        className={`ingest-pill ingest-pill-readonly${running ? ' on' : ''}`}
        title={title}
      >
        <span className="ingest-pill-dot" />
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={running}
      aria-busy={busy}
      aria-label={running ? 'Stop ingesting posts' : 'Start ingesting posts'}
      className={`ingest-pill${running ? ' on' : ''}${busy ? ' busy' : ''}`}
      title={title}
      disabled={busy || !status}
      onClick={() => void toggle()}
    >
      <span className="ingest-pill-dot" />
      {label}
    </button>
  )
}
