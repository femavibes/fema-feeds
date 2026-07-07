import { useEffect, useMemo, useState } from 'react'
import type { CompiledIngestGate, ProjectL1Config } from '@cfb/core-types'
import type { PathConjunctRole } from '@cfb/l1-compile'
import {
  flattenCombinedDiscoveryPaths,
  groupDiscoveryPathsByFeed,
  formatBranchWithSource,
  formatIngestLeafLabel,
  type CombinedDiscoveryPath,
} from '@cfb/l1-compile'
import { api } from '../api/client'

interface Props {
  draft: ProjectL1Config
}

const ROLE_LABEL: Record<PathConjunctRole, string> = {
  requirement: 'Requirement',
  block: 'Block',
  discovery: 'Match',
}

export function ProjectPrefilterCompiledPage({ draft }: Props) {
  const isStrict = (draft.prefilterMode ?? 'strict') === 'strict'
  const [feedNames, setFeedNames] = useState<Record<string, string>>({})

  useEffect(() => {
    api.listFeeds(draft.projectId).then((r) => {
      const map: Record<string, string> = {}
      for (const f of r.feeds) map[f.feedId] = f.name || f.feedId
      setFeedNames(map)
    }).catch(() => {})
  }, [draft.projectId])

  const gate: CompiledIngestGate | undefined = isStrict
    ? draft.strictIncludeGate
    : draft.ingestGate

  const scopeNames = useMemo(() => ({
    ...feedNames,
    [draft.projectId]: draft.name || 'Project',
  }), [feedNames, draft.projectId, draft.name])

  const combinedPaths = useMemo(
    () => gate ? flattenCombinedDiscoveryPaths(gate, scopeNames) : [],
    [gate, scopeNames],
  )

  const feedGroups = useMemo(
    () => gate ? groupDiscoveryPathsByFeed(gate, scopeNames) : [],
    [gate, scopeNames],
  )

  const hasBlocks = (gate?.excludeBranches?.length ?? 0) > 0
  const hasRequirements = (gate?.restrictBranches?.length ?? 0) > 0

  return (
    <div className="workspace-page project-prefilter-compiled-page">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>Compiled Gate</h2>
        </div>
        <p className="card-hint">
          {isStrict ? (
            <>
              Auto-derived from your feeds (strict mode). Posts must match at least one path below to enter the pool.
              Edit your feeds to change what gets ingested.
            </>
          ) : (
            <>
              Compiled from your manual prefilter rules. Edit in the Visual or JSON editor, then save to recompile.
            </>
          )}
        </p>
      </header>

      {/* Meta info */}
      {isStrict && draft.strictGateMeta && (
        <p className="card-hint" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          Compiled {new Date(draft.strictGateMeta.compiledAt).toLocaleString()}
          {' · '}{draft.strictGateMeta.pathCount} path{draft.strictGateMeta.pathCount !== 1 ? 's' : ''}
          {' from '}{draft.strictGateMeta.contributingFeeds.length} feed{draft.strictGateMeta.contributingFeeds.length !== 1 ? 's' : ''}
        </p>
      )}
      {!isStrict && draft.compiledL1Meta?.compiledAt && (
        <p className="card-hint" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
          Compiled {new Date(draft.compiledL1Meta.compiledAt).toLocaleString()}
        </p>
      )}

      {/* Empty state */}
      {!gate && (
        <section className="card" style={{ padding: '1rem' }}>
          <p className="card-hint">
            {isStrict
              ? 'No feeds are contributing include paths yet. Create a feed with match rules to start ingesting.'
              : 'No prefilter compiled yet. Build rules in the Visual editor and save the project.'}
          </p>
        </section>
      )}

      {gate && !hasBlocks && !hasRequirements && combinedPaths.length === 0 && (
        <section className="card" style={{ padding: '1rem' }}>
          <p className="card-hint">
            <strong>Empty gate</strong> — all Jetstream posts can enter the pool. Add match rules to your feeds to narrow ingestion.
          </p>
        </section>
      )}

      {/* How it works */}
      {gate && combinedPaths.length > 0 && (
        <section className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>How posts enter the pool</h3>
          <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
            {hasRequirements && (
              <li><strong>Requirements</strong> — post must pass all of these first</li>
            )}
            {hasBlocks && (
              <li><strong>Blocks</strong> — post is rejected if any of these match</li>
            )}
            <li>
              <strong>Discovery paths</strong> — post must match at least <strong>one</strong> path
              {feedGroups.length > 1 && <> (from any of {feedGroups.length} feeds)</>}
            </li>
          </ol>
        </section>
      )}

      {/* Requirements */}
      {gate && hasRequirements && (
        <section className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Requirements (must pass)</h3>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
            {gate.restrictBranches!.map((b, i) => (
              <li key={i}>{formatBranchWithSource(b, scopeNames)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Blocks */}
      {gate && hasBlocks && (
        <section className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>Blocks (reject if matched)</h3>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
            {gate.excludeBranches.map((b, i) => (
              <li key={i}>{formatBranchWithSource(b, scopeNames)}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Discovery paths grouped by feed */}
      {feedGroups.length > 0 && (
        <section className="card" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Discovery paths
            <span style={{ fontWeight: 400, fontSize: '0.75rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
              {combinedPaths.length} path{combinedPaths.length !== 1 ? 's' : ''} · OR (any one match = pool entry)
            </span>
          </h3>

          {feedGroups.map((group) => (
            <div key={group.feedId} style={{ marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 0.25rem', color: 'var(--primary, #3b82f6)' }}>
                {group.feedName}
                <span style={{ fontWeight: 400, fontSize: '0.7rem', marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                  {group.structuredPaths.length} path{group.structuredPaths.length !== 1 ? 's' : ''}
                </span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--primary, #3b82f6)', marginLeft: '0.25rem' }}>
                {group.structuredPaths.map((path, pi) => (
                  <div key={pi} style={{ fontSize: '0.75rem', padding: '0.25rem 0' }}>
                    {path.conjuncts.length === 1 ? (
                      <span>
                        <span className={`badge badge-muted`} style={{ fontSize: '0.6rem', marginRight: '0.25rem' }}>
                          {ROLE_LABEL[path.conjuncts[0]!.role]}
                        </span>
                        {path.conjuncts[0]!.label}
                      </span>
                    ) : (
                      <span>
                        {path.conjuncts.map((c, ci) => (
                          <span key={ci}>
                            {ci > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 0.25rem' }}>AND</span>}
                            <span className={`badge badge-muted`} style={{ fontSize: '0.6rem', marginRight: '0.25rem' }}>
                              {ROLE_LABEL[c.role]}
                            </span>
                            {c.label}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
