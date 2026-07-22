/**
 * Strict Ingest Mode — Runtime Evaluation (Optimized)
 */
import type {
  FeedConfig,
  LogicBlockPackage,
  NormalizedPost,
  ProjectL1Config,
} from '@cfb/core-types'
import {
  compileStrictGate,
  buildOptimizedStrictGate,
  evalOptimizedStrictGate,
  type OptimizedStrictGate,
  type StrictGateExtras,
} from '@cfb/l1-compile'
import { buildStrictGateLogicBlockResolver } from '@cfb/l2-worker'

export interface StrictGateState {
  gates: Map<string, OptimizedStrictGate>
}

export function buildStrictGates(
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
  logicBlockPackages?: LogicBlockPackage[],
): StrictGateState {
  const gates = new Map<string, OptimizedStrictGate>()
  const resolver = logicBlockPackages?.length
    ? buildStrictGateLogicBlockResolver(logicBlockPackages, feeds)
    : undefined

  for (const project of projects) {
    if (project.prefilterMode !== 'strict' || !project.enabled) continue
    const { strictIncludeGate } = compileStrictGate(project, feeds, resolver)
    const optimized = buildOptimizedStrictGate(strictIncludeGate)
    gates.set(project.projectId, optimized)
  }

  return { gates }
}

export function postPassesStrictGate(
  post: NormalizedPost,
  project: ProjectL1Config,
  strictState: StrictGateState,
  extras: StrictGateExtras = {},
): boolean {
  if (project.prefilterMode !== 'strict') return true
  const gate = strictState.gates.get(project.projectId)
  if (!gate) return false
  return evalOptimizedStrictGate(gate, post, extras)
}
