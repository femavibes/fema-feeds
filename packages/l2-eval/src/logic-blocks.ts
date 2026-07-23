import type { LogicBlockPackage, LogicBlockRef, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { peelLogicBlockEditorShell } from '@cfb/l2-graph'

/**
 * Effective rule tree for a logic block package.
 *
 * Packages persist nested groups in `root`. `visualLayout` is editor chrome only
 * (see logicBlockToFeedDraft — it ignores saved edges when reopening the canvas).
 * Do not run resolveFeedMatch here: stale/incomplete canvas wires would drop the
 * authored tree and break strict-gate extraction + L2 eval.
 */
export function resolveLogicBlockRoot(
  pkg: Pick<LogicBlockPackage, 'root' | 'visualLayout'>,
): L2RuleGroup {
  return peelLogicBlockEditorShell(pkg.root)
}

export function logicBlockCacheKey(ref: LogicBlockRef): string {
  return `${ref.packageId}@${ref.versionPin}`
}

export function collectLogicBlockRefs(root: L2RuleNode): LogicBlockRef[] {
  const seen = new Set<string>()
  const refs: LogicBlockRef[] = []

  const walk = (node: L2RuleNode) => {
    if (node.type === 'logic_block_ref') {
      const key = logicBlockCacheKey({ packageId: node.packageId, versionPin: node.versionPin })
      if (!seen.has(key)) {
        seen.add(key)
        refs.push({ packageId: node.packageId, versionPin: node.versionPin })
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children) walk(child)
    }
  }

  walk(root)
  return refs
}

export function createLogicBlockResolver(
  packages: Iterable<LogicBlockPackage>,
): (ref: LogicBlockRef) => L2RuleGroup | null {
  const byKey = new Map<string, L2RuleGroup>()
  for (const pkg of packages) {
    byKey.set(
      logicBlockCacheKey({ packageId: pkg.id, versionPin: pkg.version }),
      resolveLogicBlockRoot(pkg),
    )
  }
  return (ref) => byKey.get(logicBlockCacheKey(ref)) ?? null
}

/**
 * Like createLogicBlockResolver, but also aliases each feed node's stored pin to the
 * package body loaded after updatePolicy resolution (auto_minor → latest patch).
 * Eval looks up `node.versionPin` from the feed; without aliases that miss after a bump.
 */
export function createFeedLogicBlockResolver(
  packages: Iterable<LogicBlockPackage>,
  feedRefs: Array<{ packageId: string; feedPin: string; resolvedPin: string }>,
): (ref: LogicBlockRef) => L2RuleGroup | null {
  const byKey = new Map<string, L2RuleGroup>()
  for (const pkg of packages) {
    byKey.set(
      logicBlockCacheKey({ packageId: pkg.id, versionPin: pkg.version }),
      resolveLogicBlockRoot(pkg),
    )
  }
  for (const { packageId, feedPin, resolvedPin } of feedRefs) {
    if (feedPin === resolvedPin) continue
    const group = byKey.get(logicBlockCacheKey({ packageId, versionPin: resolvedPin }))
    if (group) {
      byKey.set(logicBlockCacheKey({ packageId, versionPin: feedPin }), group)
    }
  }
  return (ref) => byKey.get(logicBlockCacheKey(ref)) ?? null
}
