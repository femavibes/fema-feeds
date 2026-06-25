import type { LogicBlockPackage, LogicBlockRef, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { resolveFeedMatch } from '@cfb/l2-graph'

export function resolveLogicBlockRoot(
  pkg: Pick<LogicBlockPackage, 'root' | 'visualLayout'>,
): L2RuleGroup {
  return resolveFeedMatch({ match: pkg.root, visualLayout: pkg.visualLayout })
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
