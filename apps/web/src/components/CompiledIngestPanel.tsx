import { useMemo } from 'react'
import type { CompiledIngestGate, ProjectPrefilter } from '@cfb/core-types'
import { PROJECT_PREFILTER_SCOPE_ID } from '@cfb/core-types'
import type { PathConjunctRole } from '@cfb/l1-compile'
import {
  compileProjectPrefilter,
  flattenCombinedDiscoveryPaths,
  formatBranchWithSource,
} from '@cfb/l1-compile'

const CONJUNCT_ROLE_LABEL: Record<PathConjunctRole, string> = {
  requirement: 'Requirement',
  block: 'Block',
  discovery: 'Match',
}

function PathConjunctList({
  conjuncts,
  keyPrefix,
}: {
  conjuncts: { role: PathConjunctRole; label: string }[]
  keyPrefix: string
}) {
  return (
    <ul className="compiled-ingest-conjunct-list">
      {conjuncts.map((c, i) => (
        <li
          key={`${keyPrefix}-${i}`}
          className={`compiled-ingest-conjunct compiled-ingest-conjunct-${c.role}`}
        >
          <span className="compiled-ingest-conjunct-role">{CONJUNCT_ROLE_LABEL[c.role]}</span>
          <span className="compiled-ingest-conjunct-label">{c.label}</span>
        </li>
      ))}
    </ul>
  )
}

interface Props {
  projectId: string
  projectName: string
  prefilter?: ProjectPrefilter
  gate?: CompiledIngestGate
  compiledAt?: string
  compiledSource?: 'prefilter' | 'feeds'
  authorsOnly?: boolean
}

export function CompiledIngestPanel({
  projectId,
  projectName,
  prefilter,
  gate,
  compiledAt,
  compiledSource,
  authorsOnly,
}: Props) {
  const scopeNames = useMemo(
    () => ({
      [PROJECT_PREFILTER_SCOPE_ID]: 'Prefilter',
      [projectId]: projectName || 'Project',
    }),
    [projectId, projectName],
  )

  const liveCompiled = useMemo(() => {
    if (prefilter === undefined && compiledSource !== 'prefilter') return undefined
    return compileProjectPrefilter(projectId, prefilter)
  }, [prefilter, compiledSource, projectId])

  const displayGate = liveCompiled?.ingestGate ?? gate
  const displayAuthorsOnly = liveCompiled?.authorsOnly ?? authorsOnly

  const combinedPaths = useMemo(
    () => (displayGate ? flattenCombinedDiscoveryPaths(displayGate, scopeNames) : []),
    [displayGate, scopeNames],
  )

  const hasBlocks = (displayGate?.excludeBranches?.length ?? 0) > 0
  const hasRequirements = (displayGate?.restrictBranches?.length ?? 0) > 0
  const hasDiscovery = combinedPaths.length > 0
  const hasGateContent = hasBlocks || hasRequirements || hasDiscovery

  let sectionNum = 0
  const nextSectionTitle = (name: string) => {
    sectionNum += 1
    return `${sectionNum} · ${name}`
  }

  const isLegacyFeedCompile = compiledSource === 'feeds' || (compiledAt && prefilter === undefined)

  if (!gate && !compiledAt && prefilter === undefined) {
    return (
      <p className="card-hint">
        Build your <strong>project prefilter</strong> above, then <strong>Save</strong> in the sidebar
        to compile jetstream rules.
      </p>
    )
  }

  return (
    <div className="compiled-ingest-panel">
      <p className="compiled-ingest-meta card-hint">
        {compiledAt ? `Compiled ${new Date(compiledAt).toLocaleString()}` : 'Live preview (unsaved)'}
        {compiledSource === 'prefilter' ? ' · from project prefilter' : null}
        {isLegacyFeedCompile ? ' · legacy feed compile (save prefilter to migrate)' : null}
      </p>

      <p className="compiled-ingest-combine-hint card-hint">
        One jetstream gate per project. Below is the check order for each post.
      </p>

      {(displayAuthorsOnly && hasDiscovery) || hasRequirements || hasBlocks || hasDiscovery ? (
        <section className="compiled-ingest-section compiled-ingest-section-order">
          <h4 className="compiled-ingest-section-title">Check order (per post)</h4>
          <ol className="compiled-ingest-order-steps">
            {displayAuthorsOnly && hasDiscovery ? (
              <li className="compiled-ingest-order-step">
                <span className="compiled-ingest-order-label">Authors only</span>
                <span className="compiled-ingest-order-hint">Strangers out (prefilter author node)</span>
              </li>
            ) : null}
            {hasRequirements
              ? displayGate!.restrictBranches!.map((b, i) => (
                  <li key={`ord-rs-${i}`} className="compiled-ingest-order-step">
                    <span className="compiled-ingest-order-label">Project requirement</span>
                    <span className="compiled-ingest-order-hint">{formatBranchWithSource(b, scopeNames)}</span>
                  </li>
                ))
              : null}
            {hasBlocks
              ? displayGate!.excludeBranches.map((b, i) => (
                  <li key={`ord-ex-${i}`} className="compiled-ingest-order-step">
                    <span className="compiled-ingest-order-label">Project block</span>
                    <span className="compiled-ingest-order-hint">{formatBranchWithSource(b, scopeNames)}</span>
                  </li>
                ))
              : null}
            {hasDiscovery ? (
              <li className="compiled-ingest-order-step compiled-ingest-order-step-or">
                <span className="compiled-ingest-order-label">
                  Pool entry — path 1 <strong>or</strong> path 2 <strong>or</strong> …{' '}
                  <strong>or</strong> path {combinedPaths.length}
                </span>
                <span className="compiled-ingest-order-hint">
                  First path where every rule matches (AND within path).
                </span>
              </li>
            ) : null}
          </ol>
        </section>
      ) : null}

      {displayAuthorsOnly && hasDiscovery ? (
        <p className="compiled-ingest-authors-only">
          <strong>Authors only</strong> — strangers are rejected before pool-entry paths are tried.
        </p>
      ) : null}

      {displayGate && !hasGateContent ? (
        <p className="card-hint">
          <strong>Empty prefilter</strong> — all Jetstream posts can enter the pool.
        </p>
      ) : null}

      {displayGate && hasRequirements ? (
        <section className="compiled-ingest-section">
          <h4 className="compiled-ingest-section-title">{nextSectionTitle('Project requirements')}</h4>
          <p className="card-hint">On every pool-entry path.</p>
          <ul className="compiled-ingest-list">
            {displayGate.restrictBranches!.map((b, i) => (
              <li key={`rs-${i}`}>{formatBranchWithSource(b, scopeNames)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {displayGate && hasBlocks ? (
        <section className="compiled-ingest-section">
          <h4 className="compiled-ingest-section-title">{nextSectionTitle('Project blocks')}</h4>
          <p className="card-hint">On every pool-entry path — any match rejects the post.</p>
          <ul className="compiled-ingest-list">
            {displayGate.excludeBranches.map((b, i) => (
              <li key={`ex-${i}`}>{formatBranchWithSource(b, scopeNames)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasDiscovery ? (
        <section className="compiled-ingest-section">
          <h4 className="compiled-ingest-section-title">
            {hasRequirements || hasBlocks ? nextSectionTitle('Pool entry paths') : 'Pool entry paths'}
          </h4>
          <p className="card-hint">
            Numbered <strong>OR</strong> list — jetstream tries these until one fully matches.
          </p>
          <ol className="compiled-ingest-combined-path-list">
            {combinedPaths.map((path) => (
              <li key={`combined-${path.order}`} className="compiled-ingest-combined-path">
                <div className="compiled-ingest-combined-path-head">
                  <span className="compiled-ingest-path-num">Path {path.order}</span>
                </div>
                <PathConjunctList conjuncts={path.conjuncts} keyPrefix={`p${path.order}`} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
