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

/**
 * Graph-wide live values keyed by Param ID (`control.name`).
 * Same id on multiple Parameter panels shares one value (last panel in walk
 * order wins if stored values drifted). Explicit overrides win last.
 */
export function buildParamValueMap(
  root: L2RuleNode,
  overrides?: ParamValueMap,
): ParamValueMap {
  const map: ParamValueMap = {}
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        if (!control.name) continue
        map[control.name] = resolveControlValue(control, node.values, undefined)
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      map[k] = v
    }
  }
  return map
}

/** How many Parameter panels declare a control with this Param ID. */
export function countParamControlPanels(root: L2RuleNode, name: string): number {
  const id = name.trim()
  if (!id) return 0
  let n = 0
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      if ((node.controls ?? []).some((c) => c.name === id)) n += 1
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return n
}

/** First control definition with this Param ID (canonical chrome for shared ids). */
export function findParamControlByName(
  root: L2RuleNode,
  name: string,
  opts?: { excludePanelId?: string },
): L2ParamControl | undefined {
  const id = name.trim()
  if (!id) return undefined
  let found: L2ParamControl | undefined
  const walk = (node: L2RuleNode) => {
    if (found) return
    if (isParametersNode(node)) {
      if (opts?.excludePanelId && node.id === opts.excludePanelId) return
      const hit = (node.controls ?? []).find((c) => c.name === id)
      if (hit) found = hit
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return found
}

/**
 * Write a live value onto every Parameter panel that declares this Param ID.
 * Bindings stay per-panel; only the knob value is shared.
 */
export function setParamValueAcrossMatch(
  root: L2RuleGroup,
  name: string,
  value: boolean | string,
): L2RuleGroup {
  const id = name.trim()
  if (!id) return root

  const walk = (node: L2RuleNode): L2RuleNode => {
    if (isParametersNode(node)) {
      const has = (node.controls ?? []).some((c) => c.name === id)
      if (!has) return node
      return {
        ...node,
        values: { ...(node.values ?? {}), [id]: value },
      }
    }
    if (node.type === 'group') {
      return {
        ...node,
        children: (node.children ?? []).map(walk),
      }
    }
    return node
  }

  return walk(root) as L2RuleGroup
}

/**
 * After editing one panel, sync shared Param IDs across other panels:
 * live value + chrome (label / description / type / default).
 * Bindings stay per-face — apply unions them under the shared live value.
 */
export function syncSharedParamControlFromPanel(
  root: L2RuleGroup,
  panelId: string,
): L2RuleGroup {
  const panels = collectParameterNodes(root)
  const source = panels.find((p) => p.id === panelId)
  if (!source) return root

  const shared = (source.controls ?? []).filter(
    (c) => c.name && countParamControlPanels(root, c.name) >= 2,
  )
  if (shared.length === 0) return root

  const byName = new Map(shared.map((c) => [c.name, c]))

  const walk = (node: L2RuleNode): L2RuleNode => {
    if (isParametersNode(node)) {
      if (node.id === panelId) {
        const values = { ...(node.values ?? {}) }
        for (const c of shared) {
          values[c.name] = resolveControlValue(c, source.values, undefined)
        }
        return { ...node, values }
      }
      let touched = false
      const controls = (node.controls ?? []).map((c) => {
        const src = byName.get(c.name)
        if (!src) return c
        touched = true
        return {
          ...c,
          label: src.label,
          description: src.description,
          type: src.type,
          default: src.default,
          // Bindings / options stay local so faces can control different subsets.
        }
      })
      if (!touched) return node
      const values = { ...(node.values ?? {}) }
      for (const c of shared) {
        if ((node.controls ?? []).some((x) => x.name === c.name)) {
          values[c.name] = resolveControlValue(c, source.values, undefined)
        }
      }
      return { ...node, controls, values }
    }
    if (node.type === 'group') {
      return { ...node, children: (node.children ?? []).map(walk) }
    }
    return node
  }

  return walk(root) as L2RuleGroup
}

/** @deprecated Prefer syncSharedParamControlFromPanel. */
export function syncSharedParamValuesFromPanel(
  root: L2RuleGroup,
  panelId: string,
): L2RuleGroup {
  return syncSharedParamControlFromPanel(root, panelId)
}

export type ParamBindClaim = {
  paramName: string
  paramLabel: string
  panelId: string
}

/** Stable key for exclusive ownership of a presence or property bind. */
export function paramOwnershipKey(binding: {
  kind?: string
  nodeId: string
  property?: string
  member?: string
}): string {
  const kind = binding.kind ?? 'presence'
  if (kind === 'presence') return `${binding.nodeId}::presence`
  return `${binding.nodeId}::property::${binding.property ?? ''}::${binding.member ?? ''}`
}

function claimsFromControl(
  panelId: string,
  control: L2ParamControl,
  into: Map<string, ParamBindClaim[]>,
): void {
  if (!control.name) return
  const claim: ParamBindClaim = {
    paramName: control.name,
    paramLabel: control.label?.trim() || control.name,
    panelId,
  }
  const push = (binding: L2ParamTargetBinding) => {
    if (!binding.nodeId?.trim()) return
    const key = paramOwnershipKey(binding)
    const list = into.get(key) ?? []
    if (!list.some((c) => c.paramName === claim.paramName)) list.push(claim)
    into.set(key, list)
  }
  for (const b of normalizeControlBindings(control)) push(b)
  if (control.type === 'enum') {
    for (const opt of control.options ?? []) {
      for (const b of normalizeOptionBindings(opt)) push(b)
    }
  }
}

/** All presence/property claims in the graph, keyed by ownership key. */
export function collectParamBindClaims(
  root: L2RuleNode,
): Map<string, ParamBindClaim[]> {
  const into = new Map<string, ParamBindClaim[]>()
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        claimsFromControl(node.id, control, into)
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return into
}

/**
 * Exclusive owner of a bind key: lexicographically first Param ID among claimants.
 * Same Param ID on multiple panels shares ownership (union bindings at apply).
 */
export function exclusiveOwnerOfKey(
  root: L2RuleNode,
  key: string,
): ParamBindClaim | undefined {
  const claims = collectParamBindClaims(root).get(key)
  if (!claims || claims.length === 0) return undefined
  const sorted = [...claims].sort((a, b) => a.paramName.localeCompare(b.paramName))
  return sorted[0]
}

/** Another Param ID already owns this bind (shared same-id faces are fine). */
export function findConflictingOwner(
  root: L2RuleNode,
  binding: L2ParamTargetBinding,
  selfParamName: string,
): ParamBindClaim | undefined {
  const key = paramOwnershipKey(binding)
  const claims = collectParamBindClaims(root).get(key) ?? []
  const others = claims
    .filter((c) => c.paramName !== selfParamName)
    .sort((a, b) => a.paramName.localeCompare(b.paramName))
  return others[0]
}

/** Map ownership key → winning Param ID (for apply-time exclusive enforcement). */
export function buildExclusiveOwnerMap(root: L2RuleNode): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, claims] of collectParamBindClaims(root)) {
    const sorted = [...claims].sort((a, b) => a.paramName.localeCompare(b.paramName))
    if (sorted[0]) out.set(key, sorted[0].paramName)
  }
  return out
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
  const valueMap = buildParamValueMap(root, overrides)
  const owners = buildExclusiveOwnerMap(root)

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const value = Object.prototype.hasOwnProperty.call(valueMap, control.name)
          ? valueMap[control.name]!
          : control.default
        if (control.type === 'boolean') {
          const on = value === true || value === 'true'
          if (!on) {
            for (const id of presenceIdsFromBindings(normalizeControlBindings(control))) {
              const owner = owners.get(paramOwnershipKey({ nodeId: id, kind: 'presence' }))
              if (owner && owner !== control.name) continue
              excluded.add(id)
            }
          }
        } else if (control.type === 'enum') {
          const options = control.options ?? []
          const selected = options.find((o) => o.value === value)
          // Only presence binds this Param ID owns participate.
          const ownedPresence = (bindings: L2ParamTargetBinding[]) =>
            presenceIdsFromBindings(bindings).filter((id) => {
              const owner = owners.get(paramOwnershipKey({ nodeId: id, kind: 'presence' }))
              return !owner || owner === control.name
            })
          const keep = new Set(
            ownedPresence(selected ? normalizeOptionBindings(selected) : []),
          )
          const all = new Set(
            options.flatMap((o) => ownedPresence(normalizeOptionBindings(o))),
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
  const valueMap = buildParamValueMap(root, overrides)
  const owners = buildExclusiveOwnerMap(root)

  const owns = (controlName: string, binding: L2ParamTargetBinding) => {
    const owner = owners.get(paramOwnershipKey(binding))
    return !owner || owner === controlName
  }

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const value = Object.prototype.hasOwnProperty.call(valueMap, control.name)
          ? valueMap[control.name]!
          : control.default
        if (control.type === 'boolean') {
          const on = value === true || value === 'true'
          for (const binding of propertyBindings(normalizeControlBindings(control))) {
            if (!owns(control.name, binding)) continue
            const target = byId.get(binding.nodeId)
            if (target) applyPropertyBinding(target, binding, on)
          }
        } else if (control.type === 'enum') {
          const options = control.options ?? []
          const selected = options.find((o) => o.value === value)

          const memberMentions = new Map<string, { nodeId: string; property: string; member: string }>()
          for (const opt of options) {
            for (const b of propertyBindings(normalizeOptionBindings(opt))) {
              if (!b.member?.trim() || !b.property) continue
              if (!owns(control.name, b)) continue
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
              if (!owns(control.name, binding)) continue
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
