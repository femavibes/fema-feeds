import { useIngestRunner } from '../lib/use-ingest-runner'
import { IngestBenchmarkPanel } from './IngestBenchmarkPanel'
import { IngestToggle } from './IngestToggle'
import { MergedPrefilterPanel } from './MergedPrefilterPanel'

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
      <section className="settings-section">
        <h3 className="settings-section-title">Active Prefilter</h3>
        <MergedPrefilterPanel />
      </section>
      <IngestBenchmarkPanel
        ingestRunning={running}
        initialSmoke={status?.lastSmokeTest ?? null}
        initialStress={status?.lastStressTest ?? null}
      />
    </>
  )
}
