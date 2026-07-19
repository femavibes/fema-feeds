/**
 * Strict Ingest Mode — Runtime Evaluation (Optimized)
 */
import type {
  FeedConfig,
  LogicBlockPackage,
  LogicBlockUpdatePolicy,
  NormalizedPost,
  ProjectL1Config,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'
import {
  compileStrictGate,
  buildOptimizedStrictGate,
  evalOptimizedStrictGate,
  type LogicBlockResolver,
  type OptimizedStrictGate,
  type StrictGateExtras,
} from '@cfb/l1-compile'

export interface StrictGateState {
  gates: Map<string, OptimizedStrictGate>
}

/** Mirror of @cfb/l2-graph peelLogicBlockEditorShell — keep ingest free of l2-graph. */
const LOGIC_BLOCK_EDITOR_ROOT_ID = 'logic-block-preview-root'

function peelLogicBlockEditorShell(root: L2RuleGroup): L2RuleGroup {
  let g = root
  while (
    g.type === 'group' &&
    g.id === LOGIC_BLOCK_EDITOR_ROOT_ID &&
    g.logic === 'any' &&
    g.children?.length === 1 &&
    g.children[0]?.type === 'group'
  ) {
    g = g.children[0] as L2RuleGroup
  }
  return g
}

function isPatchUpgrade(pinned: string, latest: string): boolean {
  const pp = pinned.split('.').map((n) => Number(n) || 0)
  const lp = latest.split('.').map((n) => Number(n) || 0)
  return pp[0] === lp[0] && pp[1] === lp[1] && (lp[2] ?? 0) > (pp[2] ?? 0)
}

function resolveLogicBlockVersionPin(
  pinned: string,
  latest: string,
  policy: LogicBlockUpdatePolicy,
): string {
  if (policy === 'auto_minor' && isPatchUpgrade(pinned, latest)) return latest
  return pinned
}

function walkLogicBlockRefs(
  node: L2RuleNode,
  out: Array<{ packageId: string; versionPin: string; updatePolicy: LogicBlockUpdatePolicy }>,
): void {
  if (node.type === 'logic_block_ref') {
    out.push({
      packageId: node.packageId,
      versionPin: node.versionPin,
      updatePolicy: node.updatePolicy ?? 'notify',
    })
    return
  }
  if (node.type === 'group') {
    for (const child of node.children ?? []) walkLogicBlockRefs(child, out)
  }
}

function buildResolver(
  packages: LogicBlockPackage[],
  feeds: FeedConfig[],
): LogicBlockResolver {
  const byKey = new Map<string, L2RuleGroup>()
  const latestById = new Map<string, string>()
  for (const pkg of packages) {
    byKey.set(`${pkg.id}@${pkg.version}`, peelLogicBlockEditorShell(pkg.root))
    latestById.set(pkg.id, pkg.version)
  }

  // Alias feed pins → resolved packages so auto_minor expands against catalog head.
  for (const feed of feeds) {
    const refs: Array<{
      packageId: string
      versionPin: string
      updatePolicy: LogicBlockUpdatePolicy
    }> = []
    walkLogicBlockRefs(feed.match, refs)
    for (const node of refs) {
      const latest = latestById.get(node.packageId)
      if (!latest) continue
      const resolved = resolveLogicBlockVersionPin(node.versionPin, latest, node.updatePolicy)
      const group = byKey.get(`${node.packageId}@${resolved}`)
      if (group && node.versionPin !== resolved) {
        byKey.set(`${node.packageId}@${node.versionPin}`, group)
      }
    }
  }

  return (ref) => byKey.get(`${ref.packageId}@${ref.versionPin}`) ?? null
}

export function buildStrictGates(
  projects: ProjectL1Config[],
  feeds: FeedConfig[],
  logicBlockPackages?: LogicBlockPackage[],
): StrictGateState {
  const gates = new Map<string, OptimizedStrictGate>()
  const resolver = logicBlockPackages?.length ? buildResolver(logicBlockPackages, feeds) : undefined

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
