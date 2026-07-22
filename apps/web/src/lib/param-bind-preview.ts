import type {
  FeedConfig,
  L2ParamControl,
  L2ParamTargetBinding,
  L2ParamValue,
  L2ParametersCondition,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'
import {
  applyParametersToMatch,
  binaryEnumPolarity,
  buildParamValueMap,
  collectParamControls,
  conditionNodeTitle,
  discoverBindableFields,
  indexRuleNodesById,
  normalizeControlBindings,
  normalizeOptionBindings,
  resolveBindableField,
  resolveParamControlMode,
  resolveParamRuntimeMode,
  collectParamPropertyFieldPreviews,
  type ParamValueMap,
} from '@cfb/l2-graph'

function paramValuesEqual(a: L2ParamValue | undefined, b: L2ParamValue | undefined): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return false
}

export type EditorParamPreview = {
  overrides: ParamValueMap
  /** Param IDs in Live runtime mode (teal on param panel). */
  productionParams: ReadonlySet<string>
}

/**
 * Effective Param values for bound-node preview in the editor.
 * Always uses draft graph values so Live vs Draft runtime mode behaves the same in the UI;
 * Live only affects production writes (API/triggers) and teal styling — not stale live-feed reads.
 */
export function buildEditorParamPreview(draftFeed: FeedConfig): EditorParamPreview {
  const overrides = buildParamValueMap(draftFeed.match)
  const productionParams = new Set<string>()

  for (const control of collectParamControls(draftFeed.match)) {
    const name = control.name
    if (!name) continue
    if (resolveParamRuntimeMode(control) === 'live') {
      productionParams.add(name)
    }
  }

  return { overrides, productionParams }
}

/**
 * Property/member tokens actively driven by ON Params (for styling).
 * Unlike preview diffs, includes cases where baseline already matches the param value.
 */
export function collectParamActivePropertyTokens(
  root: L2RuleGroup,
  nodeId: string,
  overrides?: ParamValueMap,
  runtimeFilter?: 'draft' | 'live',
): Set<string> {
  const valueMap = overrides ?? buildParamValueMap(root)
  const out = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const name = control.name
        if (!name) continue
        const runtime = resolveParamRuntimeMode(control)
        if (runtimeFilter === 'live' && runtime !== 'live') continue
        if (runtimeFilter === 'draft' && runtime === 'live') continue
        if (control.type === 'boolean') {
          const val = valueMap[name] ?? control.default
          if (val !== true && val !== 'true') continue
        }
        const bindings: L2ParamTargetBinding[] =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || !b.property) continue
          const member = b.member?.trim()
          if (member) out.add(`${b.property}::${member}`)
          else out.add(b.property)
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return out
}

/** Bound properties driven by Live Params that currently show an override (teal vs blue). */
export function paramProductionPropertySet(
  root: L2RuleGroup,
  nodeId: string,
  overriddenProps: ReadonlySet<string>,
  productionParams: ReadonlySet<string>,
  overrides?: ParamValueMap,
): Set<string> {
  if (productionParams.size === 0 || overriddenProps.size === 0) return new Set()
  const valueMap = overrides ?? buildParamValueMap(root)
  const out = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const name = control.name
        if (!name || !productionParams.has(name)) continue
        if (control.type === 'boolean') {
          const val = valueMap[name] ?? control.default
          if (val !== true && val !== 'true') continue
        }
        const bindings: L2ParamTargetBinding[] =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || !b.property) continue
          const member = b.member?.trim()
          if (member) {
            const tokenKey = `${b.property}::${member}`
            if (overriddenProps.has(tokenKey) || overriddenProps.has(b.property)) out.add(tokenKey)
          } else if (overriddenProps.has(b.property)) {
            out.add(b.property)
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
  return out
}

/** Fingerprint Param property binds targeting a node — pin resets when binds change. */
export function paramBindingsKeyForNode(root: L2RuleGroup, nodeId: string): string {
  const parts: string[] = []
  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const bindings: L2ParamTargetBinding[] =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || !b.property) continue
          parts.push(
            `${control.name}:${b.property}:${b.member ?? ''}:${String(b.value ?? '')}:${b.listMode ?? ''}`,
          )
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return parts.sort().join('|')
}

/** Reset field pins when binds change or a bound Param toggles (reclaim on next ON). */
export function paramPinResetKey(
  root: L2RuleGroup,
  nodeId: string,
  overrides?: ParamValueMap,
): string {
  const bindings = paramBindingsKeyForNode(root, nodeId)
  const valueMap = overrides ?? buildParamValueMap(root)
  const paramStates: string[] = []
  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const name = control.name
        if (!name) continue
        const controlBindings: L2ParamTargetBinding[] =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        const bindsNode = controlBindings.some(
          (b) => b.kind === 'property' && b.nodeId === nodeId,
        )
        if (!bindsNode) continue
        if (control.type === 'boolean') {
          const val = valueMap[name] ?? control.default
          paramStates.push(`${name}:${val === true || val === 'true' ? '1' : '0'}`)
        } else if (control.type === 'enum') {
          const val =
            valueMap[name] ?? control.default ?? control.options?.[0]?.value ?? ''
          paramStates.push(`${name}:${String(val)}`)
        } else {
          const val = valueMap[name] ?? control.default
          paramStates.push(`${name}:${JSON.stringify(val ?? '')}`)
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return `${bindings}|${paramStates.sort().join(',')}`
}

/** Member tokens (e.g. search fields) with any Param property bind on this node. */
export function paramBoundMemberFieldsForNode(
  root: L2RuleGroup,
  nodeId: string,
  property = 'fields',
): Set<string> {
  const out = new Set<string>()
  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const bindings: L2ParamTargetBinding[] =
          control.type === 'enum'
            ? (control.options ?? []).flatMap((o) => normalizeOptionBindings(o))
            : normalizeControlBindings(control)
        for (const b of bindings) {
          if (b.kind !== 'property' || b.nodeId !== nodeId || b.property !== property) continue
          const member = b.member?.trim()
          if (member) out.add(member)
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(root)
  return out
}

/** @deprecated Use buildEditorParamPreview. */
export function liveParamPreviewOverrides(
  match: L2RuleGroup,
  liveParamValues?: Record<string, L2ParamValue>,
  draftEditedParams?: ReadonlySet<string>,
): ParamValueMap | undefined {
  if (!liveParamValues) return undefined
  const draft = buildParamValueMap(match)
  const overrides: ParamValueMap = {}
  let any = false
  for (const [name, liveVal] of Object.entries(liveParamValues)) {
    if (draftEditedParams?.has(name)) continue
    if (!paramValuesEqual(draft[name], liveVal)) {
      overrides[name] = liveVal
      any = true
    }
  }
  return any ? overrides : undefined
}

function nodeLabel(node: L2RuleNode | undefined, nodeId: string): string {
  if (!node) return nodeId
  const title = conditionNodeTitle(node)
  const custom = 'label' in node && typeof node.label === 'string' ? node.label.trim() : ''
  return custom ? `${title} (${custom})` : `${title} · ${nodeId}`
}

function fieldLabelForBinding(
  target: L2RuleNode | undefined,
  binding: L2ParamTargetBinding,
): string {
  if (!target || binding.kind !== 'property' || !binding.property) {
    return binding.property ?? 'property'
  }
  const fields = discoverBindableFields(target)
  const hit = fields.find((f) => {
    const prop = f.property ?? f.key
    if (prop !== binding.property) return false
    if (f.member) return f.member === binding.member
    if (f.valueKind === 'member') return Boolean(binding.member)
    return !binding.member
  })
  if (hit) return hit.label
  if (binding.member) return `${binding.property}:${binding.member}`
  return binding.property
}

function formatListPreview(list: string[] | undefined): string {
  if (!list || list.length === 0) return '(empty)'
  if (list.length <= 3) return list.map((t) => `“${t}”`).join(', ')
  return `${list.slice(0, 3).map((t) => `“${t}”`).join(', ')} +${list.length - 3}`
}

function formatForcedValue(
  binding: L2ParamTargetBinding,
  active: boolean,
  target?: L2RuleNode,
): string {
  if (binding.kind !== 'property') return ''
  if (binding.listValue !== undefined || binding.listMode) {
    const onList =
      binding.listValue ??
      (typeof binding.value === 'string' ? [String(binding.value)] : [])
    if (!active) return '→ node baseline (toggle off)'
    return binding.listMode === 'merge'
      ? `merge ${formatListPreview(onList)} onto node`
      : `replace with ${formatListPreview(onList)}`
  }
  if (binding.member) {
    const mode = target ? resolveParamControlMode(target) : 'override_when_on'
    const includeWhenActive = !(binding.value === false || binding.value === 'false')
    if (mode === 'full_control') {
      const include = active ? includeWhenActive : !includeWhenActive
      return include ? `add “${binding.member}”` : `remove “${binding.member}”`
    }
    return active ? `add “${binding.member}”` : '→ node baseline'
  }
  if (target) {
    const field = resolveBindableField(target, binding)
    if (field?.valueKind === 'boolean') {
      const whenOn = !(binding.value === false || binding.value === 'false')
      const mode = resolveParamControlMode(target)
      const written = active ? whenOn : mode === 'full_control' ? !whenOn : null
      if (written === null) return '→ node baseline'
      return written ? '= on' : '= off'
    }
    const polarity = field ? binaryEnumPolarity(field) : null
    if (polarity) {
      const whenActive =
        binding.value !== undefined && String(binding.value) === polarity.offValue
          ? polarity.offValue
          : polarity.onValue
      const whenInactive =
        whenActive === polarity.onValue ? polarity.offValue : polarity.onValue
      const mode = resolveParamControlMode(target)
      const written = active ? whenActive : mode === 'full_control' ? whenInactive : null
      if (written === null) return '→ node baseline'
      return `= ${written === polarity.onValue ? polarity.onLabel : polarity.offLabel}`
    }
  }
  if (binding.value !== undefined) {
    return active ? `= ${String(binding.value)}` : '→ node baseline'
  }
  if (target) {
    const field = resolveBindableField(target, binding)
    if (field?.valueKind === 'string' || field?.valueKind === 'stringList') {
      return active ? '= control value' : '→ node baseline'
    }
  }
  // boolean-style default whenOn=true
  const mode = target ? resolveParamControlMode(target) : 'override_when_on'
  if (mode === 'full_control') {
    return active ? '= on' : '= off'
  }
  return active ? '= on' : '→ node baseline'
}

export type ParamEffectLine = {
  kind: 'presence' | 'property'
  text: string
}

/** Human-readable effects for one Parameter control at a given live value. */
export function describeParamControlEffects(
  control: L2ParamControl,
  liveValue: boolean | string | string[] | undefined,
  byId: Map<string, L2RuleNode>,
): { active: boolean | string | string[]; lines: ParamEffectLine[]; idleHint?: string } {
  if (control.type === 'boolean') {
    const on = liveValue === true || liveValue === 'true' ||
      (liveValue === undefined && (control.default === true || control.default === 'true'))
    const bindings = normalizeControlBindings(control)
    const lines: ParamEffectLine[] = []

    for (const b of bindings) {
      const target = byId.get(b.nodeId)
      const who = nodeLabel(target, b.nodeId)
      if (b.kind === 'presence') {
        lines.push({
          kind: 'presence',
          text: on
            ? `${who}: stays in the graph`
            : `${who}: removed (greyed) — Presence`,
        })
      } else if (b.kind === 'property') {
        const label = fieldLabelForBinding(target, b)
        lines.push({
          kind: 'property',
          text: `${who}: ${label} ${formatForcedValue(b, on, target)}`,
        })
      }
    }

    if (lines.length === 0) {
      return {
        active: on,
        lines: [],
        idleHint: 'No Presence or property binds yet — flip does nothing to other nodes.',
      }
    }

    return { active: on, lines }
  }

  if (control.type === 'string' || control.type === 'stringList') {
    const bindings = normalizeControlBindings(control)
    const preview =
      control.type === 'stringList'
        ? formatListPreview(Array.isArray(liveValue) ? liveValue : asStringListPreview(liveValue))
        : `“${String(liveValue ?? control.default ?? '')}”`
    const lines: ParamEffectLine[] = []
    for (const b of bindings) {
      if (b.kind !== 'property') continue
      const target = byId.get(b.nodeId)
      const who = nodeLabel(target, b.nodeId)
      const label = fieldLabelForBinding(target, b)
      lines.push({
        kind: 'property',
        text: `${who}: ${label} = ${preview}${b.listMode === 'merge' ? ' (merge)' : ''}`,
      })
    }
    if (lines.length === 0) {
      return {
        active: liveValue ?? control.default,
        lines: [],
        idleHint: 'No property binds yet — this text/list control writes nowhere.',
      }
    }
    return { active: liveValue ?? control.default, lines }
  }

  // enum
  const options = control.options ?? []
  const selectedValue =
    liveValue !== undefined && liveValue !== ''
      ? String(liveValue)
      : String(control.default ?? options[0]?.value ?? '')
  const selected = options.find((o) => o.value === selectedValue)
  const lines: ParamEffectLine[] = []

  if (selected) {
    for (const b of normalizeOptionBindings(selected)) {
      const target = byId.get(b.nodeId)
      const who = nodeLabel(target, b.nodeId)
      if (b.kind === 'presence') {
        lines.push({
          kind: 'presence',
          text: `${who}: present in mode “${selected.label || selected.value}”`,
        })
      } else if (b.kind === 'property') {
        const label = fieldLabelForBinding(target, b)
        lines.push({
          kind: 'property',
          text: `${who}: ${label} ${formatForcedValue(b, true, target)}`,
        })
      }
    }
  }

  // Note nodes present only in other modes
  const keep = new Set(
    selected ? normalizeOptionBindings(selected).filter((b) => b.kind === 'presence').map((b) => b.nodeId) : [],
  )
  const allPresence = new Set(
    options.flatMap((o) =>
      normalizeOptionBindings(o).filter((b) => b.kind === 'presence').map((b) => b.nodeId),
    ),
  )
  for (const id of allPresence) {
    if (!keep.has(id)) {
      const target = byId.get(id)
      lines.push({
        kind: 'presence',
        text: `${nodeLabel(target, id)}: removed in this mode`,
      })
    }
  }

  if (lines.length === 0) {
    return {
      active: selectedValue,
      lines: [],
      idleHint: 'No binds on this mode — pick targets on each dropdown option.',
    }
  }

  return { active: selectedValue, lines }
}

function asStringListPreview(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return [value]
  return []
}

/** All Parameter-driven effects currently applied to a target node id. */
export function describeEffectsOnTarget(
  match: L2RuleGroup,
  targetId: string,
): ParamEffectLine[] {
  const byId = indexRuleNodesById(match)
  const lines: ParamEffectLine[] = []
  const target = byId.get(targetId)

  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const live = (node.values ?? {})[control.name] ?? control.default
        const label = control.label || control.name
        if (control.type === 'boolean') {
          const on =
            live === true ||
            live === 'true' ||
            (live === undefined && (control.default === true || control.default === 'true'))
          for (const b of normalizeControlBindings(control)) {
            if (b.nodeId !== targetId) continue
            if (b.kind === 'presence') {
              lines.push({
                kind: 'presence',
                text: on
                  ? `“${label}” is on → this node stays`
                  : `“${label}” is off → this node is removed`,
              })
            } else if (b.kind === 'property') {
              const fl = fieldLabelForBinding(target, b)
              lines.push({
                kind: 'property',
                text: `“${label}” → ${fl} ${formatForcedValue(b, on, target)}`,
              })
            }
          }
        } else if (control.type === 'string' || control.type === 'stringList') {
          for (const b of normalizeControlBindings(control)) {
            if (b.nodeId !== targetId || b.kind !== 'property') continue
            const fl = fieldLabelForBinding(target, b)
            const preview =
              control.type === 'stringList'
                ? formatListPreview(Array.isArray(live) ? live : asStringListPreview(live))
                : `“${String(live ?? '')}”`
            lines.push({
              kind: 'property',
              text: `“${label}” → ${fl} = ${preview}${b.listMode === 'merge' ? ' (merge)' : ''}`,
            })
          }
        } else {
          const options = control.options ?? []
          const selectedValue = String(
            live !== undefined && live !== '' ? live : (control.default ?? options[0]?.value ?? ''),
          )
          const selected = options.find((o) => o.value === selectedValue)
          const keepPresence = new Set(
            selected
              ? normalizeOptionBindings(selected)
                  .filter((b) => b.kind === 'presence')
                  .map((b) => b.nodeId)
              : [],
          )
          let mentionedRemoval = false
          for (const opt of options) {
            for (const b of normalizeOptionBindings(opt)) {
              if (b.nodeId !== targetId) continue
              if (opt.value === selected?.value) {
                if (b.kind === 'presence') {
                  lines.push({
                    kind: 'presence',
                    text: `“${label}” = ${opt.label || opt.value} → this node stays`,
                  })
                } else if (b.kind === 'property') {
                  const fl = fieldLabelForBinding(target, b)
                  lines.push({
                    kind: 'property',
                    text: `“${label}” = ${opt.label || opt.value} → ${fl} ${formatForcedValue(b, true, target)}`,
                  })
                }
              } else if (b.kind === 'presence' && !keepPresence.has(targetId) && !mentionedRemoval) {
                mentionedRemoval = true
                lines.push({
                  kind: 'presence',
                  text: `“${label}” = ${selected?.label || selectedValue} → this node is removed`,
                })
              }
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
  walk(match)
  return lines
}

export function effectiveNodeMap(match: L2RuleGroup): Map<string, L2RuleNode> {
  return indexRuleNodesById(applyParametersToMatch(match))
}

export function isTargetOfAnyParam(match: L2RuleGroup, nodeId: string): boolean {
  let hit = false
  const walk = (node: L2RuleNode) => {
    if (hit) return
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        if (control.type === 'boolean' || control.type === 'string' || control.type === 'stringList') {
          if (normalizeControlBindings(control).some((b) => b.nodeId === nodeId)) {
            hit = true
            return
          }
        } else {
          for (const opt of control.options ?? []) {
            if (normalizeOptionBindings(opt).some((b) => b.nodeId === nodeId)) {
              hit = true
              return
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
  walk(match)
  return hit
}

export type ParamPropertyLock = {
  property: string
  member?: string
  controlLabel: string
}

/** Properties on a target that Params own for editing (toggles/enums/members — not term baselines). */
export function collectParamPropertyLocks(
  match: L2RuleGroup,
  targetId: string,
): ParamPropertyLock[] {
  const locks: ParamPropertyLock[] = []
  const seen = new Set<string>()
  const byId = indexRuleNodesById(match)
  const target = byId.get(targetId)
  const fullControl =
    target && resolveParamControlMode(target) === 'full_control'

  const add = (b: L2ParamTargetBinding, controlLabel: string) => {
    if (b.kind !== 'property' || !b.property || b.nodeId !== targetId) return
    // Term/text baselines stay editable; override_when_on keeps other fields editable too.
    const field = target ? resolveBindableField(target, b) : undefined
    if (field?.valueKind === 'string' || field?.valueKind === 'stringList') return
    if (!fullControl) return
    const key = `${b.property}::${b.member ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    locks.push({
      property: b.property,
      member: b.member,
      controlLabel,
    })
  }

  const walk = (node: L2RuleNode) => {
    if (node.type === 'parameters') {
      for (const control of node.controls ?? []) {
        const label = control.label || control.name
        if (control.type === 'boolean' || control.type === 'string' || control.type === 'stringList') {
          for (const b of normalizeControlBindings(control)) add(b, label)
        } else {
          for (const opt of control.options ?? []) {
            for (const b of normalizeOptionBindings(opt)) add(b, label)
          }
        }
      }
      return
    }
    if (node.type === 'group') {
      for (const child of node.children ?? []) walk(child)
    }
  }
  walk(match)
  return locks
}

/** Locked top-level properties (any member bind locks the whole property for editing). */
export function paramLockedPropertySet(locks: ParamPropertyLock[]): Set<string> {
  return new Set(locks.map((l) => l.property))
}

export function paramLockSummary(locks: ParamPropertyLock[]): string {
  if (locks.length === 0) return ''
  const byControl = new Map<string, string[]>()
  for (const lock of locks) {
    const list = byControl.get(lock.controlLabel) ?? []
    const name = lock.member ? `${lock.property}:${lock.member}` : lock.property
    if (!list.includes(name)) list.push(name)
    byControl.set(lock.controlLabel, list)
  }
  return [...byControl.entries()]
    .map(([ctrl, props]) => `“${ctrl}” controls ${props.join(', ')}`)
    .join(' · ')
}

/**
 * Show Parameter-patched values on the node for locked properties.
 * Unlocked fields stay as authored so the form remains editable.
 */
export function overlayParamLockedValues<T extends L2RuleNode>(
  authored: T,
  effective: L2RuleNode | undefined,
  locks: ParamPropertyLock[],
): T {
  if (!effective || locks.length === 0) return authored
  const props = paramLockedPropertySet(locks)
  const out = { ...authored } as T & Record<string, unknown>
  const eff = effective as unknown as Record<string, unknown>
  for (const prop of props) {
    if (prop in eff) out[prop] = eff[prop]
  }
  return out
}

/** When saving edits, don't persist Parameter-owned fields from the display overlay. */
export function restoreParamLockedValues<T extends L2RuleNode>(
  edited: T,
  authored: T,
  locks: ParamPropertyLock[],
): T {
  if (locks.length === 0) return edited
  const props = paramLockedPropertySet(locks)
  const out = { ...edited } as T & Record<string, unknown>
  const auth = authored as unknown as Record<string, unknown>
  for (const prop of props) {
    if (prop in auth) out[prop] = auth[prop]
    else delete out[prop]
  }
  return out
}

/** Properties currently overridden by Params in override_when_on mode. */
export function paramOverridePropertySet(
  previews: Array<{ property: string; changed: boolean }>,
): Set<string> {
  return new Set(
    previews
      .filter((p) => p.changed && !p.property.includes('::'))
      .map((p) => p.property),
  )
}

/** Per-member Param override keys (e.g. fields::text) for styling / pin. */
export function paramMemberOverridePropertySet(
  previews: Array<{ property: string; changed: boolean }>,
): Set<string> {
  return new Set(previews.filter((p) => p.changed && p.property.includes('::')).map((p) => p.property))
}

const SEARCH_FIELD_ORDER = [
  'text',
  'image_alt',
  'video_alt',
  'link_title',
  'link_description',
  'link_uri',
  'facet_link',
  'facet_mention',
  'bridgy_original_text',
  'bridgy_original_url',
] as const

/** Merge one array property (fields, sources, …) per-member instead of replacing the whole list. */
function mergeMemberArrayOverlay(
  property: string,
  authoredList: string[],
  effectiveList: string[],
  previews: Array<{ property: string; changed: boolean }>,
  skipProps?: ReadonlySet<string>,
  order: readonly string[] = SEARCH_FIELD_ORDER,
): string[] {
  const auth = new Set(authoredList)
  const eff = new Set(effectiveList)
  const out: string[] = []
  for (const member of order) {
    const key = `${property}::${member}`
    const preview = previews.find((p) => p.property === key)
    const driven = Boolean(preview?.changed && !skipProps?.has(key))
    if (driven ? eff.has(member) : auth.has(member)) out.push(member)
  }
  if (out.length === 0 && order.length > 0) out.push(order[0]!)
  return out
}

/**
 * Show live Param values on the node form (override_when_on).
 * Baseline stays in storage; use restoreParamOverrideValues on save.
 */
export function overlayParamOverrideValues<T extends L2RuleNode>(
  authored: T,
  effective: L2RuleNode | undefined,
  previews: Array<{ property: string; changed: boolean }>,
  skipProps?: ReadonlySet<string>,
): T {
  const changed = previews.filter((p) => p.changed && !skipProps?.has(p.property))
  if (!effective || changed.length === 0) return authored
  const out = { ...authored } as T & Record<string, unknown>
  const auth = authored as unknown as Record<string, unknown>
  const eff = effective as unknown as Record<string, unknown>

  const memberArrayProps = new Set<string>()
  for (const p of changed) {
    const split = p.property.indexOf('::')
    if (split >= 0) {
      memberArrayProps.add(p.property.slice(0, split))
    }
  }

  for (const prop of memberArrayProps) {
    const authList = Array.isArray(auth[prop]) ? (auth[prop] as string[]) : []
    const effList = Array.isArray(eff[prop]) ? (eff[prop] as string[]) : []
    out[prop] = mergeMemberArrayOverlay(prop, authList, effList, previews, skipProps)
  }

  for (const p of changed) {
    if (p.property.includes('::')) continue
    if (memberArrayProps.has(p.property)) continue
    if (p.property in eff) out[p.property] = eff[p.property]
  }
  return out
}

/** Search-field toggles currently driven by Params (`fields::text`, …). */
export function paramSearchFieldOverrideSet(
  overriddenProps: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const key of overriddenProps) {
    if (!key.startsWith('fields::')) continue
    out.add(key.slice('fields::'.length))
  }
  return out
}

/** Override props actively showing live Param values (excludes user-pinned baseline edits). */
export function paramLiveOverrideProps(
  overrideProps: ReadonlySet<string>,
  memberOverrideProps: ReadonlySet<string>,
  pinnedBaselineProps?: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const prop of overrideProps) {
    if (!pinnedBaselineProps?.has(prop)) out.add(prop)
  }
  for (const prop of memberOverrideProps) {
    if (!pinnedBaselineProps?.has(prop)) out.add(prop)
  }
  return out
}

/** Production (teal) styling — also respects pins so pinned fields stay green. */
export function paramProductionOverrideProps(
  productionProps: ReadonlySet<string>,
  pinnedBaselineProps?: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const prop of productionProps) {
    if (!pinnedBaselineProps?.has(prop)) out.add(prop)
  }
  return out
}

/** Draft (blue) vs Live (teal) styling tokens for bound-node forms. */
export function paramStyleTokensForNode(
  root: L2RuleGroup,
  nodeId: string,
  overrides: ParamValueMap | undefined,
  pinnedBaselineProps: ReadonlySet<string>,
): { draft: Set<string>; live: Set<string> } {
  const previews = collectParamPropertyFieldPreviews(root, nodeId, overrides)
  const previewDraft = new Set([
    ...paramOverridePropertySet(previews),
    ...paramMemberOverridePropertySet(previews),
  ])
  const liveActive = collectParamActivePropertyTokens(root, nodeId, overrides, 'live')
  const draftActive = collectParamActivePropertyTokens(root, nodeId, overrides, 'draft')
  const draftUnion = new Set([...previewDraft, ...draftActive])
  const draftOnly = new Set([...draftUnion].filter((t) => !liveActive.has(t)))
  return {
    draft: paramLiveOverrideProps(
      new Set([...draftOnly].filter((t) => !t.includes('::'))),
      new Set([...draftOnly].filter((t) => t.includes('::'))),
      pinnedBaselineProps,
    ),
    live: paramProductionOverrideProps(liveActive, pinnedBaselineProps),
  }
}

/**
 * On save: keep authored baseline for overridden props unless the user
 * changed that field from what was displayed (then treat as baseline edit).
 */
export function restoreParamOverrideValues<T extends L2RuleNode>(
  edited: T,
  authored: T,
  overrideProps: ReadonlySet<string>,
  displayed: T,
): T {
  if (overrideProps.size === 0) return edited
  const out = { ...edited } as T & Record<string, unknown>
  const auth = authored as unknown as Record<string, unknown>
  const disp = displayed as unknown as Record<string, unknown>
  const edit = edited as unknown as Record<string, unknown>
  for (const prop of overrideProps) {
    if (prop.includes('::')) continue
    if (edit[prop] !== disp[prop]) continue
    if (prop in auth) out[prop] = auth[prop]
    else delete out[prop]
  }
  return out
}

export function previewLinesForParametersNode(
  panel: L2ParametersCondition,
  match: L2RuleGroup,
): { controlName: string; lines: ParamEffectLine[]; idleHint?: string }[] {
  const byId = indexRuleNodesById(match)
  return (panel.controls ?? []).map((control) => {
    const live = (panel.values ?? {})[control.name] ?? control.default
    const d = describeParamControlEffects(control, live, byId)
    return { controlName: control.name, lines: d.lines, idleHint: d.idleHint }
  })
}
