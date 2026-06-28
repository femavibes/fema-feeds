/**
 * Strict Ingest Mode — Runtime Evaluation (Optimized)
 *
 * Uses optimized gate evaluator with:
 * - Hoisted language pre-check (eliminates 70-90% of posts immediately)
 * - Aho-Corasick keyword automaton (single-pass multi-pattern scan)
 * - Evaluation order: cheap checks first
 */
import type { FeedConfig, NormalizedPost, ProjectL1Config } from '@cfb/core-types'
import { compileStrictGate, buildOptimizedStrictGate, evalOptimizedStrictGate, type OptimizedStrictGate } from '@cfb/l1-compile'

export interface StrictGateState {
  /** Optimized gate per project (only for strict mode projects). */
  gates: Map<string, OptimizedStrictGate>
}

/**
 * Build optimized strict gates for all projects in strict mode.
 * Called during config reload.
 */
export function buildStrictGates(
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
): StrictGateState {
  const gates = new Map<string, OptimizedStrictGate>()

  for (const project of projects) {
    if (project.prefilterMode !== 'strict' || !project.enabled) continue
    const { strictIncludeGate } = compileStrictGate(project, feeds)
    const optimized = buildOptimizedStrictGate(strictIncludeGate)
    gates.set(project.projectId, optimized)
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
  if (project.prefilterMode !== 'strict') return true

  const gate = strictState.gates.get(project.projectId)
  if (!gate) return false // strict mode with no gate = no feeds want anything = reject

  return evalOptimizedStrictGate(gate, post)
}
