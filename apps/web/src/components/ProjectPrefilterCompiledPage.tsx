import type { ProjectL1Config } from '@cfb/core-types'
import { CompiledIngestPanel } from './CompiledIngestPanel'

interface Props {
  draft: ProjectL1Config
}

export function ProjectPrefilterCompiledPage({ draft }: Props) {
  return (
    <div className="workspace-page project-prefilter-compiled-page">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>Prefilter</h2>
        </div>
        <p className="card-hint">
          Compiled jetstream gate for <strong>{draft.name}</strong>. Edit rules in the{' '}
          <strong>Visual</strong> or <strong>JSON editor</strong> tabs, then save the project to
          refresh this view.
        </p>
      </header>

      <section className="card compiled-ingest-card">
        <CompiledIngestPanel
          projectId={draft.projectId}
          projectName={draft.name}
          prefilter={draft.prefilter}
          gate={draft.ingestGate}
          compiledAt={draft.compiledL1Meta?.compiledAt}
          compiledSource={draft.compiledL1Meta?.source}
          authorsOnly={draft.authorsOnly}
        />
      </section>
    </div>
  )
}
