import type { L2RuleNode } from '@cfb/core-types'
import { defaultRunAtIngest, isIngestEligibleNodeType, nodeRunsAtIngest } from '@cfb/core-types'

/** Ops that can never Discover / pull into the pool — Filter only. */
export function isFilterOnlyOp(node: L2RuleNode): boolean {
  if (!('op' in node) || node.op == null) return false
  const op = String(node.op)
  return (
    op === 'excludes' ||
    op === 'not_matches' ||
    op === 'not_contains' ||
    op === 'is_not' ||
    op === 'not_in_list'
  )
}

type RunAtIngestNode = Extract<L2RuleNode, { runAtIngest?: boolean }>

function hasRunAtIngest(node: L2RuleNode): node is RunAtIngestNode {
  return isIngestEligibleNodeType(node.type) && node.type !== 'author' && node.type !== 'follow_ring' && node.type !== 'mention'
}

/** Current Discover/Filter for runAtIngest-based nodes (not author/mention/follow_ring). */
export function ingestRoleFromRunAtIngest(node: L2RuleNode): 'discover' | 'filter' {
  if (isFilterOnlyOp(node)) return 'filter'
  return nodeRunsAtIngest(node) ? 'discover' : 'filter'
}

/**
 * Discover / Filter for nodes that use `runAtIngest` (keyword, url, hashtag, …).
 * Author / mention / follow_ring keep their own `role` dropdowns.
 */
export function IngestDiscoverFilterField({
  node,
  onChange,
  readOnly = false,
}: {
  node: L2RuleNode
  onChange: (next: L2RuleNode) => void
  readOnly?: boolean
}) {
  if (!hasRunAtIngest(node)) return null

  const locked = isFilterOnlyOp(node)
  const role = locked
    ? 'filter'
    : node.runAtIngest === undefined
      ? defaultRunAtIngest(node.type)
        ? 'discover'
        : 'filter'
      : node.runAtIngest
        ? 'discover'
        : 'filter'

  return (
    <label className="l2-inspector-field l2-ingest-role-field">
      Mode
      <select
        disabled={readOnly || locked}
        value={role}
        onChange={(e) => {
          const next = e.target.value as 'discover' | 'filter'
          onChange({ ...node, runAtIngest: next === 'discover' })
        }}
        title={
          locked
            ? 'Exclude-style match modes are Filter-only (they cannot pull posts into the pool)'
            : 'Discover pulls matching posts into the project pool at ingest; Filter only gates posts already in play'
        }
      >
        <option value="discover">Discover (matching posts can enter the pool)</option>
        <option value="filter">Filter (only gate posts already in play)</option>
      </select>
      {locked ? (
        <span className="l2-condition-hint">
          This match mode is Filter-only — switch to an include-style op to enable Discover.
        </span>
      ) : null}
    </label>
  )
}

/** When changing op to an exclude-style value, force runAtIngest off. */
export function withOpAndIngestRole<T extends L2RuleNode & { op?: string; runAtIngest?: boolean }>(
  node: T,
  op: T['op'],
): T {
  const next = { ...node, op }
  if (isFilterOnlyOp(next)) {
    return { ...next, runAtIngest: false }
  }
  return next
}
