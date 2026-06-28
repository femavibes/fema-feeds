/**
 * Strict Ingest Mode — Runtime Evaluation (Optimized)
 */
import type { FeedConfig, LogicBlockPackage, NormalizedPost, ProjectL1Config, L2RuleGroup } from '@cfb/core-types'
import {
  compileStrictGate,
  buildOptimizedStrictGate,
  evalOptimizedStrictGate,
  type LogicBlockResolver,
  type OptimizedStrictGate,
} from '@cfb/l1-compile'

export interface StrictGateState {
  gates: Map<string, OptimizedStrictGate>
}

function buildResolver(packages: LogicBlockPackage[]): LogicBlockResolver {
  const byKey = new Map<string, L2RuleGroup>()
  for (const pkg of packages) {
    byKey.set(`${pkg.id}@${pkg.version}`, pkg.root)
  }
  return (ref) => byKey.get(`${ref.packageId}@${ref.versionPin}`) ?? null
}

export function buildStrictGates(
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
  logicBlockPackages?: LogicBlockPackage[],
): StrictGateState {
  const gates = new Map<string, OptimizedStrictGate>()
  const resolver = logicBlockPackages?.length ? buildResolver(logicBlockPackages) : undefined

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
): boolean {
  if (project.prefilterMode !== 'strict') return true
  const gate = strictState.gates.get(project.projectId)
  if (!gate) return false
  return evalOptimizedStrictGate(gate, post)
}
