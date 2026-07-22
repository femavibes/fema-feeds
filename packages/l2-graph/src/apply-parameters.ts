import type {
  L2ParamControl,
  L2ParamEnumOption,
  L2ParamRuntimeMode,
  L2ParamTargetBinding,
  L2ParamTrigger,
  L2ParametersCondition,
  L2ParamValue,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'

import { normalizeRuleGroup } from './normalize-match.js'
import {
  binaryEnumPolarity,
  indexRuleNodesById,
  isValidPropertyBinding,
  resolveBindableField,
  findDiscoveredField,
  type ParamBindableField,
} from './param-bind-fields.js'
import { resolveParamControlMode } from './param-control-mode.js'

export type ParamValueMap = Record<string, L2ParamValue>

export function resolveParamRuntimeMode(control: L2ParamControl): L2ParamRuntimeMode {
  return control.runtimeMode === 'live' ? 'live' : 'draft'
}

export function resolveTriggerRuntimeMode(trigger: L2ParamTrigger): L2ParamRuntimeMode {
  return trigger.runtimeMode === 'live' ? 'live' : 'draft'
}

function isParametersNode(node: L2RuleNode): node is L2ParametersCondition {
  return node.type === 'parameters'
}

function resolveControlValue(
  control: L2ParamControl,
  nodeValues: ParamValueMap | undefined,
  overrides: ParamValueMap | undefined,
): L2ParamValue {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, control.name)) {
    return overrides[control.name]!
  }
  if (nodeValues && Object.prototype.hasOwnProperty.call(nodeValues, control.name)) {
    return nodeValues[control.name]!
  }
  return control.default
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((x) => String(x))
  if (typeof value === 'string') return value ? [value] : []
  return []
}

function mergeStringLists(base: string[], incoming: string[]): string[] {
  const out = [...base]
  for (const item of incoming) {
    if (!out.includes(item)) out.push(item)
  }
  return out
}

function coerceTextPayload(
  field: ParamBindableField,
  payload: string | string[],
): string | string[] {
  if (field.valueKind === 'string') {
    return Array.isArray(payload) ? payload.join(' ') : String(payload ?? '')
  }
  return asStringList(payload)
}

/**
 * Resolve a string / stringList write.
 * - Toggle OFF: no write (node keeps its authored baseline terms).
 * - Toggle ON: listValue with replace or merge (composed across Param IDs later).
 * - Dropdown option selected: listValue / value for that option.
 * - Legacy string/stringList controls: write the live control value.
 */
function resolveTextPropertyWrite(
  field: ParamBindableField,
  binding: L2ParamTargetBinding,
  opts: {
    controlType: L2ParamControl['type']
    controlValue: L2ParamValue
    active: boolean
  },
): { property: string; value: string | string[]; mode: 'replace' | 'merge' } | null {
  if (binding.kind !== 'property' || !binding.property) return null
  if (field.valueKind !== 'string' && field.valueKind !== 'stringList') return null

  const mode = binding.listMode === 'merge' ? 'merge' : 'replace'
  let payload: string | string[] | undefined

  if (opts.controlType === 'string' || opts.controlType === 'stringList') {
    if (Array.isArray(opts.controlValue)) payload = opts.controlValue
    else if (typeof opts.controlValue === 'string') payload = opts.controlValue
    else payload = opts.controlValue ? 'true' : ''
  } else if (opts.controlType === 'boolean') {
    // Off → leave node baseline alone (no write).
    if (!opts.active) return null
    payload =
      binding.listValue ??
      (typeof binding.value === 'string' || typeof binding.value === 'number'
        ? String(binding.value)
        : [])
  } else if (opts.controlType === 'enum') {
    if (!opts.active) return null
    if (binding.listValue) payload = binding.listValue
    else if (binding.value !== undefined) payload = String(binding.value)
    else return null
  }

  if (payload === undefined) return null
  return {
    property: binding.property,
    value: coerceTextPayload(field, payload),
    mode,
  }
}

/**
 * Compose text/list writes onto one field.
 * - Only merge votes ON: baseline ∪ all merge lists.
 * - Any replace vote ON: discard baseline; union all replace lists, then ∪ merge lists.
 * Same Param ID is one vote (caller dedupes by param name).
 */
function composeTextFieldValue(
  baseline: unknown,
  votes: Array<{ value: string | string[]; mode: 'replace' | 'merge' }>,
  asList: boolean,
): string | string[] {
  const replaces = votes.filter((v) => v.mode === 'replace')
  const merges = votes.filter((v) => v.mode === 'merge')

  let out: string[]
  if (replaces.length > 0) {
    out = []
    for (const v of replaces) out = mergeStringLists(out, asStringList(v.value))
    for (const v of merges) out = mergeStringLists(out, asStringList(v.value))
  } else {
    out = asList ? asStringList(baseline) : asStringList(baseline)
    for (const v of merges) out = mergeStringLists(out, asStringList(v.value))
  }

  if (asList) return out
  // string fields: join with space when composing multiple; single replace keeps one string
  if (votes.length === 1 && !Array.isArray(votes[0]!.value)) {
    return String(votes[0]!.value)
  }
  return out.join(' ')
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
  value: L2ParamValue,
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
 * After editing one panel, fully sync shared Param IDs onto every other panel
 * that declares the same id: chrome, options, bindings, and live value.
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
          placeholder: src.placeholder,
          options: src.options ? structuredClone(src.options) : undefined,
          bindings: src.bindings ? structuredClone(src.bindings) : [],
          runtimeMode: src.runtimeMode,
          targetNodeIds: undefined,
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

/** What a property binding would write for the given active state (booleans / binary enums / members / text). */
function computePropertyWrite(
  node: L2RuleNode,
  binding: L2ParamTargetBinding,
  active: boolean,
  controlMeta?: { type: L2ParamControl['type']; value: L2ParamValue },
):
  | { kind: 'bool'; property: string; value: boolean }
  | { kind: 'enum'; property: string; value: string; onValue: string; offValue: string }
  | { kind: 'member'; property: string; member: string; include: boolean }
  | { kind: 'text'; property: string; value: string | string[]; mode: 'replace' | 'merge' }
  | { kind: 'raw'; property: string; value: unknown }
  | null {
  if (binding.kind !== 'property' || !binding.property) return null
  if (!isValidPropertyBinding(node, binding)) return null
  const field = resolveBindableField(node, binding)
  if (!field) return null

  const mode = resolveParamControlMode(node)
  const overrideWhenOn = mode === 'override_when_on'

  if (field.valueKind === 'string' || field.valueKind === 'stringList') {
    const text = resolveTextPropertyWrite(field, binding, {
      controlType: controlMeta?.type ?? 'boolean',
      controlValue: controlMeta?.value ?? (active ? true : false),
      active,
    })
    if (!text) return null
    return { kind: 'text', ...text }
  }

  if (overrideWhenOn && !active) return null

  if (field.valueKind === 'member' || field.member) {
    const member = (binding.member ?? field.member)?.trim()
    if (!member) return null
    const includeWhenActive = !(binding.value === false || binding.value === 'false')
    return {
      kind: 'member',
      property: binding.property,
      member,
      include: active ? includeWhenActive : !includeWhenActive,
    }
  }

  if (field.valueKind === 'boolean') {
    const whenOn = !(binding.value === false || binding.value === 'false')
    return {
      kind: 'bool',
      property: binding.property,
      value: active ? whenOn : !whenOn,
    }
  }

  const polarity = binaryEnumPolarity(field)
  if (polarity) {
    const whenActive =
      binding.value !== undefined && String(binding.value) === polarity.offValue
        ? polarity.offValue
        : polarity.onValue
    const whenInactive =
      whenActive === polarity.onValue ? polarity.offValue : polarity.onValue
    return {
      kind: 'enum',
      property: binding.property,
      value: active ? whenActive : whenInactive,
      onValue: polarity.onValue,
      offValue: polarity.offValue,
    }
  }

  if (binding.value !== undefined && active) {
    return { kind: 'raw', property: binding.property, value: binding.value }
  }
  return null
}

/**
 * Apply property patches. Presence is already AND-style (any off strips).
 * Overlapping boolean / binary-enum / member binds from *different* Param IDs
 * AND together (all must agree for the “on/include” pole). Same Param ID on
 * multiple panels is one vote.
 * Text/list: toggle off = no write (node baseline). Toggle on replace/merge;
 * multiple active replaces union their lists (baseline dropped); merges add
 * onto baseline (or onto the replace union).
 * Non-text in override_when_on mode: Param OFF = no write (node baseline).
 * full_control: Param OFF writes the inverse pole (legacy behavior).
 */
function applyPropertyPatches(root: L2RuleGroup, overrides?: ParamValueMap): void {
  const byId = indexRuleNodesById(root)
  const valueMap = buildParamValueMap(root, overrides)

  // key → paramName → write
  const boolVotes = new Map<string, Map<string, boolean>>()
  const enumVotes = new Map<
    string,
    Map<string, { value: string; onValue: string; offValue: string }>
  >()
  const memberVotes = new Map<string, Map<string, boolean>>()
  // nodeId::property → paramName → text write (same Param ID = one vote)
  const textVotes = new Map<
    string,
    Map<string, { value: string | string[]; mode: 'replace' | 'merge' }>
  >()
  const rawWrites: Array<{ nodeId: string; property: string; value: unknown }> = []

  const noteBool = (nodeId: string, property: string, paramName: string, value: boolean) => {
    const key = `${nodeId}::${property}`
    const m = boolVotes.get(key) ?? new Map()
    m.set(paramName, value)
    boolVotes.set(key, m)
  }
  const noteEnum = (
    nodeId: string,
    property: string,
    paramName: string,
    value: string,
    onValue: string,
    offValue: string,
  ) => {
    const key = `${nodeId}::${property}`
    const m = enumVotes.get(key) ?? new Map()
    m.set(paramName, { value, onValue, offValue })
    enumVotes.set(key, m)
  }
  const noteMember = (
    nodeId: string,
    property: string,
    member: string,
    paramName: string,
    include: boolean,
  ) => {
    const key = `${nodeId}::${property}::${member}`
    const m = memberVotes.get(key) ?? new Map()
    m.set(paramName, include)
    memberVotes.set(key, m)
  }
  const noteText = (
    nodeId: string,
    property: string,
    paramName: string,
    value: string | string[],
    mode: 'replace' | 'merge',
  ) => {
    const key = `${nodeId}::${property}`
    const m = textVotes.get(key) ?? new Map()
    m.set(paramName, { value, mode })
    textVotes.set(key, m)
  }

  const consider = (
    nodeId: string,
    paramName: string,
    binding: L2ParamTargetBinding,
    active: boolean,
    controlMeta: { type: L2ParamControl['type']; value: L2ParamValue },
  ) => {
    const target = byId.get(nodeId)
    if (!target) return
    const write = computePropertyWrite(target, binding, active, controlMeta)
    if (!write) return
    if (write.kind === 'bool') noteBool(nodeId, write.property, paramName, write.value)
    else if (write.kind === 'enum') {
      noteEnum(nodeId, write.property, paramName, write.value, write.onValue, write.offValue)
    } else if (write.kind === 'member') {
      noteMember(nodeId, write.property, write.member, paramName, write.include)
    } else if (write.kind === 'text') {
      noteText(nodeId, write.property, paramName, write.value, write.mode)
    } else {
      rawWrites.push({ nodeId, property: write.property, value: write.value })
    }
  }

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const value = Object.prototype.hasOwnProperty.call(valueMap, control.name)
          ? valueMap[control.name]!
          : control.default
        const meta = { type: control.type, value }
        if (control.type === 'boolean') {
          const on = value === true || value === 'true'
          for (const binding of propertyBindings(normalizeControlBindings(control))) {
            consider(binding.nodeId, control.name, binding, on, meta)
          }
        } else if (control.type === 'enum') {
          const options = control.options ?? []
          const selected = options.find((o) => o.value === value)
          // Clear members mentioned by any option first (same as before).
          for (const opt of options) {
            for (const b of propertyBindings(normalizeOptionBindings(opt))) {
              if (!b.member?.trim() || !b.property) continue
              const target = byId.get(b.nodeId)
              if (target) applyMember(target, b.property, b.member.trim(), false)
            }
          }
          if (selected) {
            for (const binding of propertyBindings(normalizeOptionBindings(selected))) {
              consider(binding.nodeId, control.name, binding, true, meta)
            }
          }
        } else if (control.type === 'string' || control.type === 'stringList') {
          for (const binding of propertyBindings(normalizeControlBindings(control))) {
            consider(binding.nodeId, control.name, binding, true, meta)
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

  for (const [key, votes] of boolVotes) {
    const [nodeId, property] = key.split('::')
    const target = byId.get(nodeId!)
    if (!target || !property) continue
    const and = [...votes.values()].every(Boolean)
    asRecord(target)[property] = and
  }

  for (const [key, votes] of enumVotes) {
    const [nodeId, property] = key.split('::')
    const target = byId.get(nodeId!)
    if (!target || !property) continue
    const list = [...votes.values()]
    const onValue = list[0]!.onValue
    const offValue = list[0]!.offValue
    const allOn = list.every((v) => v.value === onValue)
    asRecord(target)[property] = allOn ? onValue : offValue
  }

  for (const [key, votes] of memberVotes) {
    const [nodeId, property, member] = key.split('::')
    const target = byId.get(nodeId!)
    if (!target || !property || !member) continue
    const include = [...votes.values()].every(Boolean)
    applyMember(target, property, member, include)
  }

  for (const [key, votes] of textVotes) {
    const [nodeId, property] = key.split('::')
    const target = byId.get(nodeId!)
    if (!target || !property) continue
    const field = resolveBindableField(target, {
      property,
    })
    const asList = field?.valueKind !== 'string'
    const baseline = asRecord(target)[property]
    asRecord(target)[property] = composeTextFieldValue(
      baseline,
      [...votes.values()],
      asList,
    )
  }

  for (const w of rawWrites) {
    const target = byId.get(w.nodeId)
    if (!target) continue
    asRecord(target)[w.property] = w.value
  }
}

export type ApplyParametersOptions = {
  /** Overrides (e.g. logic_block_ref.paramValues); win over node.values and defaults. */
  values?: ParamValueMap
}

export type ParamListFieldPreview = {
  property: string
  label: string
  authored: string[]
  effective: string[]
  /** True when Params change the live list vs the node baseline. */
  changed: boolean
}

/**
 * For a target node: authored vs live (after applyParameters) list/string fields
 * that any Param currently drives. Used so the UI can show merge/replace results
 * while the baseline stays editable.
 */
export function collectParamListFieldPreviews(
  root: L2RuleGroup,
  nodeId: string,
  overrides?: ParamValueMap,
): ParamListFieldPreview[] {
  const byId = indexRuleNodesById(root)
  const authored = byId.get(nodeId)
  if (!authored || authored.type === 'parameters' || authored.type === 'group') return []

  const driven = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const bindings =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || !b.property) continue
          const field = resolveBindableField(authored, b)
          if (field?.valueKind === 'string' || field?.valueKind === 'stringList') {
            driven.add(b.property)
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
  if (driven.size === 0) return []

  const effectiveRoot = applyParametersToMatch(root, { values: overrides })
  const effective = indexRuleNodesById(effectiveRoot).get(nodeId)
  if (!effective) return []

  const authRec = asRecord(authored)
  const effRec = asRecord(effective)
  const out: ParamListFieldPreview[] = []
  for (const property of driven) {
    const field = resolveBindableField(authored, { property })
    const label = field?.label ?? property
    const authoredList =
      field?.valueKind === 'string'
        ? typeof authRec[property] === 'string' && authRec[property]
          ? [String(authRec[property])]
          : []
        : asStringList(authRec[property])
    const effectiveList =
      field?.valueKind === 'string'
        ? typeof effRec[property] === 'string' && effRec[property]
          ? [String(effRec[property])]
          : []
        : asStringList(effRec[property])
    const changed =
      [...authoredList].sort().join('\0') !== [...effectiveList].sort().join('\0')
    out.push({ property, label, authored: authoredList, effective: effectiveList, changed })
  }
  return out
}

export type ParamPropertyFieldPreview = {
  property: string
  label: string
  authoredDisplay: string
  effectiveDisplay: string
  /** True when live Param apply changes this property vs the node baseline. */
  changed: boolean
}

function formatPropertyPreviewValue(
  field: ParamBindableField | undefined,
  value: unknown,
): string {
  if (field?.valueKind === 'boolean') {
    return value === true || value === 'true' ? 'on' : 'off'
  }
  const polarity = field ? binaryEnumPolarity(field) : null
  if (polarity) {
    return String(value) === polarity.onValue ? polarity.onLabel : polarity.offLabel
  }
  if (value === undefined || value === null) return '(unset)'
  return String(value)
}

/**
 * For override_when_on targets: authored vs live bool/enum fields that Params
 * currently drive. full_control uses locked overlays instead.
 */
export function collectParamPropertyFieldPreviews(
  root: L2RuleGroup,
  nodeId: string,
  overrides?: ParamValueMap,
): ParamPropertyFieldPreview[] {
  const byId = indexRuleNodesById(root)
  const authored = byId.get(nodeId)
  if (!authored || authored.type === 'parameters' || authored.type === 'group') return []
  if (resolveParamControlMode(authored) === 'full_control') return []

  const driven = new Map<string, ParamBindableField>()
  const memberProperties = new Set<string>()
  /** Per-token array binds (search fields, url sources, …) for toggle-level preview. */
  const memberTokens: { property: string; member: string; label: string }[] = []
  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        const bindings =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || !b.property) continue
          const field = resolveBindableField(authored, b)
          if (!field || field.valueKind === 'string' || field.valueKind === 'stringList') continue
          const member = (b.member ?? field.member)?.trim()
          if (field.valueKind === 'member' || member) {
            memberProperties.add(b.property)
            if (member) {
              memberTokens.push({
                property: b.property,
                member,
                label: field.label ?? member,
              })
            }
            continue
          }
          driven.set(b.property, field)
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  if (driven.size === 0 && memberProperties.size === 0) return []

  const effectiveRoot = applyParametersToMatch(root, { values: overrides })
  const effective = indexRuleNodesById(effectiveRoot).get(nodeId)
  if (!effective) return []

  const authRec = asRecord(authored)
  const effRec = asRecord(effective)
  const out: ParamPropertyFieldPreview[] = []
  for (const [property, field] of driven) {
    const authoredDisplay = formatPropertyPreviewValue(field, authRec[property])
    const effectiveDisplay = formatPropertyPreviewValue(field, effRec[property])
    const changed = authoredDisplay !== effectiveDisplay
    if (!changed) continue
    out.push({
      property,
      label: field.label ?? property,
      authoredDisplay,
      effectiveDisplay,
      changed,
    })
  }
  for (const property of memberProperties) {
    const field = resolveBindableField(authored, { property })
    const authoredList = asStringList(authRec[property])
    const effectiveList = asStringList(effRec[property])
    const changed =
      [...authoredList].sort().join('\0') !== [...effectiveList].sort().join('\0')
    if (changed && memberTokens.length === 0) {
      out.push({
        property,
        label: field?.label ?? property,
        authoredDisplay: authoredList.length ? authoredList.join(', ') : '(none)',
        effectiveDisplay: effectiveList.length ? effectiveList.join(', ') : '(none)',
        changed,
      })
    }
  }
  const seenMemberKeys = new Set<string>()
  for (const { property, member, label } of memberTokens) {
    const key = `${property}::${member}`
    if (seenMemberKeys.has(key)) continue
    seenMemberKeys.add(key)
    const authoredList = asStringList(authRec[property])
    const effectiveList = asStringList(effRec[property])
    const authOn = authoredList.includes(member)
    const effOn = effectiveList.includes(member)
    if (authOn === effOn) continue
    out.push({
      property: key,
      label,
      authoredDisplay: authOn ? 'on' : 'off',
      effectiveDisplay: effOn ? 'on' : 'off',
      changed: true,
    })
  }
  return out
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

export type ParamAndBlockedTarget = {
  /** Short description, e.g. "presence" or "caseSensitive". */
  effect: string
  nodeId: string
  /** Other Param labels blocking this effect. */
  blockedBy: string[]
}

export type ParamAndBlockInfo = {
  /** Other Param labels whose off/disagree vote is preventing some of this control’s effects. */
  blockedBy: string[]
  /** Per-target detail for inspector copy. */
  blockedTargets: ParamAndBlockedTarget[]
  /** How many of this control’s binds are currently AND-blocked. */
  blockedEffectCount: number
  /** Total presence/property binds on this control. */
  totalEffectCount: number
}

/**
 * For boolean controls that are currently ON: which other Param IDs are AND-blocking
 * at least one of this control’s presence/property effects.
 */
export function collectParamAndBlockers(
  root: L2RuleNode,
  overrides?: ParamValueMap,
): Map<string, ParamAndBlockInfo> {
  const valueMap = buildParamValueMap(root, overrides)
  const byId = indexRuleNodesById(root)
  const labelByName = new Map<string, string>()
  for (const c of collectParamControls(root)) {
    labelByName.set(c.name, c.label?.trim() || c.name)
  }

  // presence: nodeId → paramName → on?
  const presenceVotes = new Map<string, Map<string, boolean>>()
  // bool property: nodeId::property → paramName → desired bool
  const boolVotes = new Map<string, Map<string, boolean>>()
  // binary enum: nodeId::property → paramName → isOnPole
  const enumOnVotes = new Map<string, Map<string, boolean>>()
  // member: nodeId::property::member → paramName → include
  const memberVotes = new Map<string, Map<string, boolean>>()

  // Which keys each param binds (for attributing blocks back to an ON control)
  const presenceKeysByParam = new Map<string, Set<string>>()
  const boolKeysByParam = new Map<string, Set<string>>()
  const enumKeysByParam = new Map<string, Set<string>>()
  const memberKeysByParam = new Map<string, Set<string>>()

  const addVote = (
    map: Map<string, Map<string, boolean>>,
    key: string,
    paramName: string,
    value: boolean,
  ) => {
    const m = map.get(key) ?? new Map()
    m.set(paramName, value)
    map.set(key, m)
  }
  const trackKey = (byParam: Map<string, Set<string>>, paramName: string, key: string) => {
    const s = byParam.get(paramName) ?? new Set()
    s.add(key)
    byParam.set(paramName, s)
  }

  const walk = (node: L2RuleNode) => {
    if (isParametersNode(node)) {
      for (const control of node.controls ?? []) {
        if (control.type !== 'boolean') continue
        const value = Object.prototype.hasOwnProperty.call(valueMap, control.name)
          ? valueMap[control.name]!
          : control.default
        const on = value === true || value === 'true'
        for (const binding of normalizeControlBindings(control)) {
          if (binding.kind === 'presence') {
            addVote(presenceVotes, binding.nodeId, control.name, on)
            trackKey(presenceKeysByParam, control.name, binding.nodeId)
            continue
          }
          if (binding.kind !== 'property') continue
          const target = byId.get(binding.nodeId)
          if (!target) continue
          const write = computePropertyWrite(target, binding, on, {
            type: 'boolean',
            value: on,
          })
          if (!write) continue
          if (write.kind === 'bool') {
            const key = `${binding.nodeId}::${write.property}`
            addVote(boolVotes, key, control.name, write.value)
            trackKey(boolKeysByParam, control.name, key)
          } else if (write.kind === 'enum') {
            const key = `${binding.nodeId}::${write.property}`
            addVote(enumOnVotes, key, control.name, write.value === write.onValue)
            trackKey(enumKeysByParam, control.name, key)
          } else if (write.kind === 'member') {
            const key = `${binding.nodeId}::${write.property}::${write.member}`
            addVote(memberVotes, key, control.name, write.include)
            trackKey(memberKeysByParam, control.name, key)
          }
          // text / raw: not AND-composed — skip blocker tracking
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)

  const blockersForKey = (votes: Map<string, boolean>, selfName: string): string[] => {
    const out: string[] = []
    for (const [name, v] of votes) {
      if (name === selfName) continue
      if (!v) out.push(labelByName.get(name) || name)
    }
    return out
  }

  const result = new Map<string, ParamAndBlockInfo>()

  for (const control of collectParamControls(root)) {
    if (control.type !== 'boolean') continue
    const value = Object.prototype.hasOwnProperty.call(valueMap, control.name)
      ? valueMap[control.name]!
      : control.default
    const on = value === true || value === 'true'
    if (!on) continue

    const blockedBy = new Set<string>()
    const blockedTargets: ParamAndBlockedTarget[] = []
    let blockedEffectCount = 0
    const totalEffectCount =
      (presenceKeysByParam.get(control.name)?.size ?? 0) +
      (boolKeysByParam.get(control.name)?.size ?? 0) +
      (enumKeysByParam.get(control.name)?.size ?? 0) +
      (memberKeysByParam.get(control.name)?.size ?? 0)

    const noteBlocked = (
      votes: Map<string, boolean>,
      effect: string,
      nodeId: string,
    ) => {
      const who = blockersForKey(votes, control.name)
      if (who.length === 0) return
      blockedEffectCount += 1
      for (const label of who) blockedBy.add(label)
      blockedTargets.push({ effect, nodeId, blockedBy: who })
    }

    for (const nodeId of presenceKeysByParam.get(control.name) ?? []) {
      const votes = presenceVotes.get(nodeId)
      if (!votes || votes.size < 2) continue
      noteBlocked(votes, 'presence', nodeId)
    }

    for (const key of boolKeysByParam.get(control.name) ?? []) {
      const votes = boolVotes.get(key)
      if (!votes || votes.size < 2) continue
      const selfVote = votes.get(control.name)
      if (selfVote !== true) continue
      if (![...votes.values()].every(Boolean)) {
        const [nodeId, property] = key.split('::')
        noteBlocked(votes, property || 'setting', nodeId || key)
      }
    }

    for (const key of enumKeysByParam.get(control.name) ?? []) {
      const votes = enumOnVotes.get(key)
      if (!votes || votes.size < 2) continue
      if (votes.get(control.name) !== true) continue
      if (![...votes.values()].every(Boolean)) {
        const [nodeId, property] = key.split('::')
        noteBlocked(votes, property || 'setting', nodeId || key)
      }
    }

    for (const key of memberKeysByParam.get(control.name) ?? []) {
      const votes = memberVotes.get(key)
      if (!votes || votes.size < 2) continue
      if (votes.get(control.name) !== true) continue
      if (![...votes.values()].every(Boolean)) {
        const [nodeId, property, member] = key.split('::')
        const effect = member ? `${property}:${member}` : property || 'setting'
        noteBlocked(votes, effect, nodeId || key)
      }
    }

    if (blockedBy.size > 0) {
      result.set(control.name, {
        blockedBy: [...blockedBy].sort(),
        blockedTargets,
        blockedEffectCount,
        totalEffectCount,
      })
    }
  }

  return result
}

/** Inspector copy listing which targets are blocked by which Param. */
export function formatParamAndBlockHint(
  info: ParamAndBlockInfo,
  opts?: {
    /** Visual custom names keyed by node id. */
    nodeLabels?: Record<string, string>
    /** Optional match tree for group / logic-block labels. */
    match?: L2RuleNode
  },
): string {
  const byId = opts?.match ? indexRuleNodesById(opts.match) : undefined
  const formatNode = (nodeId: string): string => {
    const fromMap = opts?.nodeLabels?.[nodeId]?.trim()
    if (fromMap) return `${fromMap} (${nodeId})`
    const node = byId?.get(nodeId)
    if (node && (node.type === 'group' || node.type === 'logic_block_ref')) {
      const label = node.label?.trim()
      if (label) return `${label} (${nodeId})`
    }
    return nodeId
  }

  const formatEffect = (nodeId: string, effect: string): string => {
    if (effect === 'presence') return 'Presence'
    const node = byId?.get(nodeId)
    if (node) {
      const byKey = findDiscoveredField(node, effect)
      if (byKey?.label) return byKey.label
      const colon = effect.indexOf(':')
      const property = colon >= 0 ? effect.slice(0, colon) : effect
      const member = colon >= 0 ? effect.slice(colon + 1) : undefined
      const field = resolveBindableField(node, { property, member })
      if (field?.label) return field.label
    }
    // Fallback: humanize camelCase / snake_case keys
    return effect
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase())
  }

  const partial =
    info.totalEffectCount > 0 && info.blockedEffectCount < info.totalEffectCount
  const lines = info.blockedTargets.map((t) => {
    const who = t.blockedBy.join(', ')
    return `${formatEffect(t.nodeId, t.effect)} on ${formatNode(t.nodeId)} — ${who}`
  })
  const head = partial
    ? 'Some targets blocked (others still apply):'
    : 'Targets blocked:'
  return [head, ...lines.map((l) => `• ${l}`)].join('\n')
}
