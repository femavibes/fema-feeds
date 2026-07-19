import type {
  LogicBlockUpdatePolicy,
  LogicBlockUpgradeHint,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'

export interface LogicBlockRefInFeed {
  nodeId: string
  packageId: string
  versionPin: string
  label?: string
  updatePolicy: LogicBlockUpdatePolicy
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function isPatchUpgrade(pinned: string, latest: string): boolean {
  const pp = pinned.split('.').map((n) => Number(n) || 0)
  const lp = latest.split('.').map((n) => Number(n) || 0)
  return (
    pp[0] === lp[0] &&
    pp[1] === lp[1] &&
    (lp[2] ?? 0) > (pp[2] ?? 0) &&
    compareSemver(latest, pinned) > 0
  )
}

export function collectLogicBlockRefNodes(root: L2RuleNode): LogicBlockRefInFeed[] {
  const nodes: LogicBlockRefInFeed[] = []

  const walk = (node: L2RuleNode) => {
    if (node.type === 'logic_block_ref') {
      nodes.push({
        nodeId: node.id,
        packageId: node.packageId,
        versionPin: node.versionPin,
        label: node.label,
        updatePolicy: node.updatePolicy ?? 'notify',
      })
      return
    }
    if (node.type === 'group') {
      for (const child of node.children) walk(child)
    }
  }

  walk(root)
  return nodes
}

export function scanLogicBlockUpgrades(
  refs: LogicBlockRefInFeed[],
  latestByPackageId: Map<string, { version: string; name: string }>,
): LogicBlockUpgradeHint[] {
  const hints: LogicBlockUpgradeHint[] = []

  for (const ref of refs) {
    const latest = latestByPackageId.get(ref.packageId)
    if (!latest || compareSemver(latest.version, ref.versionPin) <= 0) continue

    hints.push({
      nodeId: ref.nodeId,
      packageId: ref.packageId,
      packageName: latest.name,
      label: ref.label,
      pinnedVersion: ref.versionPin,
      latestVersion: latest.version,
      updatePolicy: ref.updatePolicy,
      patchUpgrade: isPatchUpgrade(ref.versionPin, latest.version),
    })
  }

  return hints
}

export function applyLogicBlockUpgrades(
  root: L2RuleGroup,
  bumps: Map<string, string>,
): L2RuleGroup {
  if (bumps.size === 0) return root

  const walk = (node: L2RuleNode): L2RuleNode => {
    if (node.type === 'logic_block_ref') {
      const nextVersion = bumps.get(node.id)
      if (!nextVersion) return node
      return { ...node, versionPin: nextVersion }
    }
    if (node.type === 'group') {
      return {
        ...node,
        children: node.children.map(walk),
      }
    }
    return node
  }

  const next = walk(root)
  return next.type === 'group' ? next : root
}

/**
 * Bump feed pins for auto_minor refs when a newer patch exists.
 * Returns the tree and which node ids changed (empty if nothing to do).
 */
export function bumpAutoMinorLogicBlockPins(
  root: L2RuleGroup,
  latestByPackageId: Map<string, string>,
  /** When set, only bump refs for this package id. */
  packageIdFilter?: string,
): { next: L2RuleGroup; bumpedNodeIds: string[] } {
  const bumpedNodeIds: string[] = []

  const walk = (node: L2RuleNode): L2RuleNode => {
    if (node.type === 'logic_block_ref') {
      if (packageIdFilter && node.packageId !== packageIdFilter) return node
      const policy = node.updatePolicy ?? 'notify'
      if (policy !== 'auto_minor') return node
      const latest = latestByPackageId.get(node.packageId)
      if (!latest || !isPatchUpgrade(node.versionPin, latest)) return node
      if (node.versionPin === latest) return node
      bumpedNodeIds.push(node.id)
      return { ...node, versionPin: latest }
    }
    if (node.type === 'group') {
      return {
        ...node,
        children: node.children.map(walk),
      }
    }
    return node
  }

  const nextNode = walk(root)
  const next = nextNode.type === 'group' ? nextNode : root
  return { next, bumpedNodeIds }
}

/** Hints that still need a human decision (exclude quiet/pinned + auto_minor patches). */
export function manualLogicBlockUpgradeHints(
  hints: LogicBlockUpgradeHint[],
): LogicBlockUpgradeHint[] {
  return hints.filter((h) => {
    if (h.updatePolicy === 'pinned') return false
    if (h.updatePolicy === 'auto_minor' && h.patchUpgrade) return false
    return true
  })
}

export function resolveLogicBlockVersionPin(
  pinned: string,
  latest: string,
  policy: LogicBlockUpdatePolicy,
): string {
  if (policy === 'auto_minor' && isPatchUpgrade(pinned, latest)) return latest
  return pinned
}
