import type {
  L2ParamControl,
  L2ParamTargetBinding,
  L2ParametersCondition,
  L2RuleGroup,
  L2RuleNode,
} from '@cfb/core-types'
import {
  applyParametersToMatch,
  binaryEnumPolarity,
  conditionNodeTitle,
  discoverBindableFields,
  indexRuleNodesById,
  normalizeControlBindings,
  normalizeOptionBindings,
  resolveBindableField,
} from '@cfb/l2-graph'

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
    return active ? `add “${binding.member}”` : `remove “${binding.member}”`
  }
  if (binding.value !== undefined) {
    return active ? `= ${String(binding.value)}` : '(unchanged when off)'
  }
  if (target) {
    const field = resolveBindableField(target, binding)
    if (field?.valueKind === 'string' || field?.valueKind === 'stringList') {
      return active ? '= control value' : '→ node baseline'
    }
    const polarity = field ? binaryEnumPolarity(field) : null
    if (polarity) {
      return active ? `= ${polarity.onLabel}` : `= ${polarity.offLabel}`
    }
  }
  // boolean-style: on → true, off → false
  return active ? '= on' : '= off'
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

  const add = (b: L2ParamTargetBinding, controlLabel: string) => {
    if (b.kind !== 'property' || !b.property || b.nodeId !== targetId) return
    // Term/text baselines stay editable on the node; Param only overlays when on.
    const field = target ? resolveBindableField(target, b) : undefined
    if (field?.valueKind === 'string' || field?.valueKind === 'stringList') return
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
