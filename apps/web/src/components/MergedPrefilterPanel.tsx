import { useEffect, useState } from 'react'
import { api } from '../api/client'

interface IngestGateBranch {
  type: string
  [key: string]: unknown
}

interface IngestGate {
  includeBranches?: IngestGateBranch[]
  excludeBranches?: IngestGateBranch[]
  restrictBranches?: IngestGateBranch[]
}

interface ProjectGate {
  projectId: string
  name: string
  ingestGate: IngestGate
}

function branchLabel(b: IngestGateBranch): string {
  if (b.type === 'language') return `Language: ${(b.allow as string[])?.join(', ') ?? '?'}`
  if (b.type === 'post_kind') return `Post kind: ${(b.kinds as string[])?.join(', ') ?? '?'}`
  if (b.type === 'keyword') return `Keyword: ${(b.terms as string[])?.slice(0, 3).join(', ') ?? '?'}${(b.terms as string[])?.length > 3 ? '…' : ''}`
  if (b.type === 'author') return `Author list`
  if (b.type === 'label') return `Label: ${(b.values as string[])?.join(', ') ?? '?'}`
  return b.type
}

export function MergedPrefilterPanel() {
  const [gates, setGates] = useState<ProjectGate[]>([])
  const [globalGate, setGlobalGate] = useState<IngestGate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/ingest/merged-prefilter')
      .then((r) => r.json())
      .then((data: { projects?: ProjectGate[]; globalGate?: IngestGate | null; error?: string }) => {
        if (data.error) { setError(data.error); return }
        setGates(data.projects ?? [])
        setGlobalGate(data.globalGate ?? null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="card-hint">Loading prefilter…</p>
  if (error) return <p className="field-error">{error}</p>

  const hasGlobal = globalGate && (
    (globalGate.restrictBranches?.length ?? 0) +
    (globalGate.excludeBranches?.length ?? 0) +
    (globalGate.includeBranches?.length ?? 0)
  ) > 0

  if (gates.length === 0 && !hasGlobal) return <p className="card-hint">No prefilters configured.</p>

  const allRestrict = gates.flatMap((g) => g.ingestGate.restrictBranches ?? [])
  const allExclude = gates.flatMap((g) => g.ingestGate.excludeBranches ?? [])
  const allInclude = gates.flatMap((g) => g.ingestGate.includeBranches ?? [])

  return (
    <div className="merged-prefilter-panel">
      {hasGlobal && (
        <div className="merged-prefilter-section merged-prefilter-global">
          <h4 className="merged-prefilter-section-title">
            <span className="badge badge-warning">Global</span> Deployment prefilter
          </h4>
          {(globalGate!.restrictBranches ?? []).length > 0 && (
            <ul className="merged-prefilter-list">
              {globalGate!.restrictBranches!.map((b, i) => (
                <li key={`gr-${i}`} className="merged-prefilter-item restrict">
                  <span className="badge badge-muted">restrict</span> {branchLabel(b)}
                </li>
              ))}
            </ul>
          )}
          {(globalGate!.excludeBranches ?? []).length > 0 && (
            <ul className="merged-prefilter-list">
              {globalGate!.excludeBranches!.map((b, i) => (
                <li key={`ge-${i}`} className="merged-prefilter-item exclude">
                  <span className="badge badge-muted">exclude</span> {branchLabel(b)}
                </li>
              ))}
            </ul>
          )}
          {(globalGate!.includeBranches ?? []).length > 0 && (
            <ul className="merged-prefilter-list">
              {globalGate!.includeBranches!.map((b, i) => (
                <li key={`gi-${i}`} className="merged-prefilter-item include">
                  <span className="badge badge-muted">include</span> {branchLabel(b)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {gates.length > 0 && (
        <p className="card-hint">
          Combined ingest gate from {gates.length} project{gates.length > 1 ? 's' : ''}.
          Posts must pass these rules to enter the pool from Jetstream.
        </p>
      )}

      {allRestrict.length > 0 && (
        <div className="merged-prefilter-section">
          <h4 className="merged-prefilter-section-title">Restrict (must match)</h4>
          <ul className="merged-prefilter-list">
            {allRestrict.map((b, i) => (
              <li key={i} className="merged-prefilter-item restrict">{branchLabel(b)}</li>
            ))}
          </ul>
        </div>
      )}

      {allExclude.length > 0 && (
        <div className="merged-prefilter-section">
          <h4 className="merged-prefilter-section-title">Exclude (reject if match)</h4>
          <ul className="merged-prefilter-list">
            {allExclude.map((b, i) => (
              <li key={i} className="merged-prefilter-item exclude">{branchLabel(b)}</li>
            ))}
          </ul>
        </div>
      )}

      {allInclude.length > 0 && (
        <div className="merged-prefilter-section">
          <h4 className="merged-prefilter-section-title">Include (fast-pass)</h4>
          <ul className="merged-prefilter-list">
            {allInclude.map((b, i) => (
              <li key={i} className="merged-prefilter-item include">{branchLabel(b)}</li>
            ))}
          </ul>
        </div>
      )}

      {allRestrict.length === 0 && allExclude.length === 0 && allInclude.length === 0 && gates.length > 0 && (
        <p className="card-hint">All project prefilters are empty — no early rejection at Jetstream level.</p>
      )}

      {gates.length > 0 && (
        <details className="merged-prefilter-per-project">
          <summary>Per-project breakdown</summary>
          {gates.map((g) => (
            <div key={g.projectId} className="merged-prefilter-project">
              <strong>{g.name}</strong>
              <span className="card-hint">
                {(g.ingestGate.restrictBranches?.length ?? 0) + (g.ingestGate.excludeBranches?.length ?? 0) + (g.ingestGate.includeBranches?.length ?? 0)} rules
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
