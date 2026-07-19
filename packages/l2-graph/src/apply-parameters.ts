import type {
  L2ParamControl,
  L2ParamEnumOption,
  L2ParamTargetBinding,
  L2ParametersCondition,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'

import { normalizeRuleGroup } from './normalize-match.js'
import {
  binaryEnumPolarity,
  indexRuleNodesById,
  isValidPropertyBinding,
  resolveBindableField,
} from './param-bind-fields.js'

export type ParamValueMap = Record<string, boolean | string>

function isParametersNode(node: L2RuleNode): node is L2ParametersCondition {
  return node.type === 'parameters'
}

function resolveControlValue(
  control: L2ParamControl,
  nodeValues: ParamValueMap | undefined,
  overrides: ParamValueMap | undefined,
): boolean | string {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, control.name)) {
    return overrides[control.name]!
  }
  if (nodeValues && Object.prototype.hasOwnProperty.call(nodeValues, control.name)) {
    return nodeValues[control.name]!
  }
  return control.default
}

/** Expand legacy `targetNodeIds` into presence bindings (deduped). */
export function normalizeControlBindings(control: L2ParamControl): L2ParamTargetBinding[] {
  const out: L2ParamTargetBinding[] = []
  const seen = new Set<string>()
  const push = (b: L2ParamTargetBinding) => {
    const key = `${b.kind}:${b.nodeId}:${b.property ?? ''}:${b.member ?? ''}:${String(b.value ?? '')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(b)
  }
  for (const id of control.targetNodeIds ?? []) {
    if (id.trim()) push({ nodeId: id.trim(), kind: 'presence' })
  }
  for (const b of control.bindings ?? []) {
    if (!b.nodeId?.trim()) continue
    push({ ...b, nodeId: b.nodeId.trim(), kind: b.kind ?? 'presence' })
  }
  return out
}

export function normalizeOptionBindings(option: L2ParamEnumOption): L2ParamTargetBinding[] {
  const out: L2ParamTargetBinding[] = []
  const seen = new Set<string>()
  const push = (b: L2ParamTargetBinding) => {
    const key = `${b.kind}:${b.nodeId}:${b.property ?? ''}:${b.member ?? ''}:${String(b.value ?? '')}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(b)
  }
  for (const id of option.targetNodeIds ?? []) {
    if (id.trim()) push({ nodeId: id.trim(), kind: 'presence' })
  }
  for (const b of option.bindings ?? []) {
    if (!b.nodeId?.trim()) continue
    push({ ...b, nodeId: b.nodeId.trim(), kind: b.kind ?? 'presence' })
  }
  return out
}

function presenceIdsFromBindings(bindings: L2ParamTargetBinding[]): string[] {
  return bindings.filter((b) => b.kind === 'presence').map((b) => b.nodeId)
}

function propertyBindings(bindings: L2ParamTargetBinding[]): L2ParamTargetBinding[] {
  return bindings.filter((b) => b.kind === 'property' && b.property)
}

function collectParameterNodeIds(root: L2RuleNode): Set<string> {
  const ids = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      ids.add(node.id)
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return ids
}

/** Collect node ids that should be treated as non-existent for the current values. */
export function collectExcludedNodeIds(
  root: L2RuleNode,
  overrides?: ParamValueMap,
): Set<string> {
  const excluded = new Set<string>()

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const value = resolveControlValue(control, node.values, overrides)
        if (control.type === 'boolean') {
          const on = value === true || value === 'true'
          if (!on) {
            for (const id of presenceIdsFromBindings(normalizeControlBindings(control))) {
              excluded.add(id)
            }
          }
        } else if (control.type === 'enum') {
          const options = control.options ?? []
          const selected = options.find((o) => o.value === value)
          const keep = new Set(
            presenceIdsFromBindings(selected ? normalizeOptionBindings(selected) : []),
          )
          const all = new Set(
            options.flatMap((o) => presenceIdsFromBindings(normalizeOptionBindings(o))),
          )
          for (const id of all) {
            if (!keep.has(id)) excluded.add(id)
          }
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }

  walk(root)
  for (const id of collectParameterNodeIds(root)) excluded.delete(id)
  return excluded
}

/**
 * Strip Parameter Nodes and excluded targets (group = whole subtree).
 * Empty groups after stripping are removed (treated as non-existent).
 */
export function stripParametersAndExcluded(
  root: L2RuleGroup,
  excluded: ReadonlySet<string>,
): L2RuleGroup {
  const stripNode = (node: L2RuleNode): L2RuleNode | null => {
    if (isParametersNode(node)) return null
    if (excluded.has(node.id)) return null

    if (node.type === 'group') {
      const children = (node.children ?? [])
        .map(stripNode)
        .filter((c): c is L2RuleNode => c != null)
      if (children.length === 0) return null
      return { ...node, children }
    }
    return node
  }

  const children = (root.children ?? [])
    .map(stripNode)
    .filter((c): c is L2RuleNode => c != null)

  return { ...root, children }
}

function asRecord(node: L2RuleNode): Record<string, unknown> {
  return node as unknown as Record<string, unknown>
}

function applyMember(
  node: L2RuleNode,
  property: string,
  member: string,
  active: boolean,
): void {
  const rec = asRecord(node)
  const cur = rec[property]
  const list = Array.isArray(cur) ? [...(cur as string[])] : []
  const idx = list.indexOf(member)
  if (active) {
    if (idx < 0) list.push(member)
  } else if (idx >= 0) {
    list.splice(idx, 1)
  }
  rec[property] = list
}

function applyPropertyBinding(
  node: L2RuleNode,
  binding: L2ParamTargetBinding,
  active: boolean,
): void {
  if (binding.kind !== 'property' || !binding.property) return
  if (!isValidPropertyBinding(node, binding)) return
  const field = resolveBindableField(node, binding)
  if (!field) return
  const rec = asRecord(node)

  // Array membership (language.allow, keyword.fields:text, …)
  if (field.valueKind === 'member' || field.member) {
    const member = (binding.member ?? field.member)?.trim()
    if (!member) return
    // Default: add when active. value === false → remove when active (add when inactive).
    const includeWhenActive = !(binding.value === false || binding.value === 'false')
    applyMember(node, binding.property, member, active ? includeWhenActive : !includeWhenActive)
    return
  }

  if (field.valueKind === 'boolean') {
    // Default when-on → true; value false → when-on → false (inactive gets inverse).
    const whenOn = !(binding.value === false || binding.value === 'false')
    rec[binding.property] = active ? whenOn : !whenOn
    return
  }

  const polarity = binaryEnumPolarity(field)
  if (polarity) {
    const whenActive =
      binding.value !== undefined && String(binding.value) === polarity.offValue
        ? polarity.offValue
        : polarity.onValue
    const whenInactive =
      whenActive === polarity.onValue ? polarity.offValue : polarity.onValue
    rec[binding.property] = active ? whenActive : whenInactive
    return
  }

  // Non-binary enum absolute value (dropdown Parameter option).
  if (binding.value !== undefined && active) {
    rec[binding.property] = binding.value
  }
}

function applyPropertyPatches(root: L2RuleGroup, overrides?: ParamValueMap): void {
  const byId = indexRuleNodesById(root)

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const value = resolveControlValue(control, node.values, overrides)
        if (control.type === 'boolean') {
          const on = value === true || value === 'true'
          for (const binding of propertyBindings(normalizeControlBindings(control))) {
            const target = byId.get(binding.nodeId)
            if (target) applyPropertyBinding(target, binding, on)
          }
        } else if (control.type === 'enum') {
          const options = control.options ?? []
          const selected = options.find((o) => o.value === value)

          // Member fields: clear members mentioned by any option, then add selected.
          const memberMentions = new Map<string, { nodeId: string; property: string; member: string }>()
          for (const opt of options) {
            for (const b of propertyBindings(normalizeOptionBindings(opt))) {
              if (!b.member?.trim() || !b.property) continue
              const key = `${b.nodeId}::${b.property}::${b.member.trim()}`
              memberMentions.set(key, {
                nodeId: b.nodeId,
                property: b.property,
                member: b.member.trim(),
              })
            }
          }
          for (const m of memberMentions.values()) {
            const target = byId.get(m.nodeId)
            if (target) applyMember(target, m.property, m.member, false)
          }

          if (selected) {
            for (const binding of propertyBindings(normalizeOptionBindings(selected))) {
              const target = byId.get(binding.nodeId)
              if (target) applyPropertyBinding(target, binding, true)
            }
          }
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }

  walk(root)
}

export type ApplyParametersOptions = {
  /** Overrides (e.g. logic_block_ref.paramValues); win over node.values and defaults. */
  values?: ParamValueMap
}

/**
 * Compile parameters away:
 * 1) apply property patches
 * 2) exclude presence-off targets
 * 3) drop Parameter Nodes
 */
export function applyParametersToMatch(
  root: L2RuleGroup,
  options?: ApplyParametersOptions,
): L2RuleGroup {
  const normalized = normalizeRuleGroup(structuredClone(root))
  applyPropertyPatches(normalized, options?.values)
  const excluded = collectExcludedNodeIds(normalized, options?.values)
  return stripParametersAndExcluded(normalized, excluded)
}

/** All Parameter Nodes in a tree (for schema export / consumer UI). */
export function collectParameterNodes(root: L2RuleNode): L2ParametersCondition[] {
  const out: L2ParametersCondition[] = []
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      out.push(node)
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return out
}

/** Flatten controls from all Parameter Nodes (first name wins). */
export function collectParamControls(root: L2RuleNode): L2ParamControl[] {
  const seen = new Set<string>()
  const controls: L2ParamControl[] = []
  for (const panel of collectParameterNodes(root)) {
    for (const c of panel.controls ?? []) {
      if (seen.has(c.name)) continue
      seen.add(c.name)
      controls.push(c)
    }
  }
  return controls
}
