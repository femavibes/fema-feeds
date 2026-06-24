import { useIngestRunner } from '../lib/use-ingest-runner'
import { IngestBenchmarkPanel } from './IngestBenchmarkPanel'
import { IngestToggle } from './IngestToggle'

interface Props {
  onStatusChange?: () => void
}

export function IngestSettingsSection({ onStatusChange }: Props) {
  const { status, running, busy, error, toggle } = useIngestRunner({
    pollMs: 3000,
    onStatusChange: () => onStatusChange?.(),
  })

  return (
    <>
      <section className="settings-section">
        <IngestToggle
          layout="card"
          status={status}
          running={running}
          busy={busy}
          error={error}
          onToggle={toggle}
        />
      </section>
      <IngestBenchmarkPanel
        ingestRunning={running}
        initialSmoke={status?.lastSmokeTest ?? null}
        initialStress={status?.lastStressTest ?? null}
      />
    </>
  )
}
