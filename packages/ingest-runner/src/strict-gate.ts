/**
 * Strict Ingest Mode — Runtime Evaluation
 *
 * Loads and evaluates strict include gates during ingest.
 * A post passes strict mode if it matches the project's compiled strict include gate.
 */
import type { CompiledIngestGate, FeedConfig, NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { compileStrictGate } from '@cfb/l1-compile'
import { evaluateIngestGate } from '@cfb/l1-filters'

export interface StrictGateState {
  /** Compiled gate per project (only for strict mode projects). */
  gates: Map<string, CompiledIngestGate>
}

/**
 * Build strict gates for all projects in strict mode.
 * Called during config reload.
 */
export function buildStrictGates(
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
): StrictGateState {
  const gates = new Map<string, CompiledIngestGate>()

  for (const project of projects) {
    if (project.prefilterMode !== 'strict' || !project.enabled) continue
    const { strictIncludeGate } = compileStrictGate(project, feeds)
    // Only store if there are actual include paths
    if (strictIncludeGate.includeBranches.length > 0) {
      gates.set(project.projectId, strictIncludeGate)
    }
  }

  return { gates }
}

/**
 * Evaluate whether a post passes a project's strict include gate.
 * Returns true if the post should be KEPT (matches at least one feed's logic).
 * Returns true if the project is NOT in strict mode (passthrough).
 */
export function postPassesStrictGate(
  post: NormalizedPost,
  project: ProjectL1Config,
  strictState: StrictGateState,
): boolean {
  if (project.prefilterMode !== 'strict') return true // manual mode = passthrough

  const gate = strictState.gates.get(project.projectId)
  if (!gate) return false // strict mode with no gate = no feeds want anything = reject

  return evaluateIngestGate(gate, post)
}
