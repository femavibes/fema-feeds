import type { L2ParamControl, L2ParamListenScope, L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import { indexRuleNodesById } from '@cfb/l2-graph'

/** Picker value when listening to a node id not in bound targets. */
export const LISTEN_PICKER_OTHER = 'other' as const

/** Node ids this Param controls (mirrors server eval). */
export function boundNodeIdsForControl(control: L2ParamControl): string[] {
  const ids = new Set<string>()
  for (const b of control.bindings ?? []) {
    const id = b.nodeId?.trim()
    if (id) ids.add(id)
  }
  for (const id of control.targetNodeIds ?? []) {
    const t = id?.trim()
    if (t) ids.add(t)
  }
  for (const opt of control.options ?? []) {
    for (const b of opt.bindings ?? []) {
      const id = b.nodeId?.trim()
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function defaultListenScope(control: L2ParamControl): {
  scope: L2ParamListenScope
  nodeId?: string
} {
  const bound = boundNodeIdsForControl(control)
  if (bound.length === 1) return { scope: 'node', nodeId: bound[0] }
  return { scope: 'feed' }
}

export type ListenPickerValue =
  | 'feed'
  | 'any_bound'
  | 'all_bound'
  | typeof LISTEN_PICKER_OTHER
  | `node:${string}`

export function isOtherListenNode(control: L2ParamControl, nodeId?: string): boolean {
  const id = nodeId?.trim()
  if (!id) return false
  return !boundNodeIdsForControl(control).includes(id)
}

export function listenPickerValue(
  control: L2ParamControl,
  scope: L2ParamListenScope,
  nodeId?: string,
): ListenPickerValue {
  if (scope === 'feed') return 'feed'
  if (scope === 'any_bound') return 'any_bound'
  if (scope === 'all_bound') return 'all_bound'
  if (scope === 'node' && isOtherListenNode(control, nodeId)) return LISTEN_PICKER_OTHER
  const id = nodeId?.trim()
  return id ? (`node:${id}` as ListenPickerValue) : 'feed'
}

export function listenScopeFromPicker(value: ListenPickerValue): {
  scope: L2ParamListenScope
  nodeId?: string
} {
  if (value === 'feed') return { scope: 'feed' }
  if (value === 'any_bound') return { scope: 'any_bound' }
  if (value === 'all_bound') return { scope: 'all_bound' }
  if (value === LISTEN_PICKER_OTHER) return { scope: 'node', nodeId: '' }
  if (value.startsWith('node:')) {
    return { scope: 'node', nodeId: value.slice(5) }
  }
  return { scope: 'feed' }
}

export type ListenNodeOption = {
  value: ListenPickerValue
  label: string
  group: 'feed' | 'bound' | 'aggregate' | 'other'
}

function nodeDisplayLabel(
  nodeId: string,
  node: L2RuleNode | undefined,
  nodeLabels: Record<string, string>,
): string {
  const custom = nodeLabels[nodeId]?.trim()
  if (custom) return custom
  if (node && 'label' in node && typeof node.label === 'string' && node.label.trim()) {
    return node.label.trim()
  }
  return nodeId
}

/** Build listen-to dropdown options for match rate / staleness triggers. */
export function buildListenPickerOptions(opts: {
  control: L2ParamControl
  match: L2RuleGroup
  nodeLabels?: Record<string, string>
  kind: 'match_rate' | 'staleness'
}): ListenNodeOption[] {
  const { control, match, nodeLabels = {} } = opts
  const bound = boundNodeIdsForControl(control)
  const byId = indexRuleNodesById(match)
  const out: ListenNodeOption[] = [
    { value: 'feed', label: 'Whole feed', group: 'feed' },
  ]

  for (const id of bound) {
    out.push({
      value: `node:${id}`,
      label: `${nodeDisplayLabel(id, byId.get(id), nodeLabels)} (bound)`,
      group: 'bound',
    })
  }

  if (bound.length > 1) {
    out.push({
      value: 'any_bound',
      label: opts.kind === 'staleness' ? 'Any bound target (quiet)' : 'Any bound target',
      group: 'aggregate',
    })
    out.push({
      value: 'all_bound',
      label: opts.kind === 'staleness' ? 'All bound targets (quiet)' : 'All bound targets',
      group: 'aggregate',
    })
  }

  out.push({ value: LISTEN_PICKER_OTHER, label: 'Other', group: 'other' })
  return out
}

export function listenPickerHint(kind: 'match_rate' | 'staleness'): string {
  if (kind === 'match_rate') {
    return 'Listen to the whole feed, a bound target, or paste another node id — independent of what this Param controls.'
  }
  return 'Listen for quiet on the feed, a bound target, or paste another node id.'
}
