import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type {
  L2ParamControl,
  L2ParamEnumOption,
  L2ParamRuntimeMode,
  L2ParamTargetBinding,
  L2ParamValue,
  L2ParametersCondition,
  L2RuleGroup,
} from '@cfb/core-types'
import {
  bindingFromBindableField,
  bindingMatchesField,
  binaryEnumPolarity,
  buildParamValueMap,
  collectParameterNodes,
  collectParamAndBlockers,
  countParamControlPanels,
  discoverBindableFields,
  findParamControlByName,
  formatParamAndBlockHint,
  indexRuleNodesById,
  normalizeControlBindings,
  normalizeOptionBindings,
  resolveParamRuntimeMode,
  unsupportedInputKeysForNode,
  type ParamAndBlockInfo,
} from '@cfb/l2-graph'

import { triggersForControl } from '../../lib/param-triggers-ui'

import { newId } from '../../lib/l2-form'
import { TermListEditor } from '../TermListEditor'
import { ToggleRow } from '../ToggleRow'
import { ToggleSwitch } from '../ToggleSwitch'
import { ParamNodeBindProps } from './ParamNodeBindProps'
import { ParamTriggersButton, ParamTriggersModal } from './ParamTriggersModal'

function newBooleanControl(): L2ParamControl {
  const name = `toggle_${newId('p').slice(-4)}`
  return {
    name,
    label: 'New toggle',
    description: '',
    type: 'boolean',
    default: true,
    bindings: [],
  }
}

function newEnumControl(): L2ParamControl {
  const name = `mode_${newId('p').slice(-4)}`
  return {
    name,
    label: 'Mode',
    description: '',
    type: 'enum',
    default: 'a',
    options: [
      { value: 'a', label: 'Option A', targetNodeIds: [], bindings: [] },
      { value: 'b', label: 'Option B', targetNodeIds: [], bindings: [] },
    ],
  }
}

function controlKindLabel(type: L2ParamControl['type']): string {
  if (type === 'boolean') return 'Toggle'
  if (type === 'enum') return 'Dropdown'
  if (type === 'string') return 'Text field (legacy)'
  return 'Term list (legacy)'
}

/** Current authored value on a target for seeding a text/list Param bind. */
function seedFromTargetField(
  target: { type: string } | undefined,
  field: { key: string; property?: string; valueKind: string },
): string | string[] | undefined {
  if (!target) return undefined
  const prop = field.property ?? field.key
  const rec = target as unknown as Record<string, unknown>
  const cur = rec[prop]
  if (field.valueKind === 'stringList') {
    return Array.isArray(cur) ? [...(cur as string[])] : []
  }
  if (field.valueKind === 'string') {
    return typeof cur === 'string' ? cur : ''
  }
  return undefined
}

function isEmptyParamValue(value: L2ParamValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function CopyIcon({ done }: { done?: boolean }) {
  if (done) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LabelHelpButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm l2-param-label-help-btn"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      ?
    </button>
  )
}

function ParamHelpModal({
  titleId,
  title,
  children,
  onClose,
}: {
  titleId: string
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return createPortal(
    <div
      className="l2-param-modal-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        className="l2-param-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className="l2-param-modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Text field that keeps focus while typing; commits on blur. */
function BlurCommitInput({
  value,
  disabled,
  className,
  placeholder,
  transform,
  onCommit,
}: {
  value: string
  disabled?: boolean
  className?: string
  placeholder?: string
  transform?: (raw: string) => string
  onCommit: (next: string) => void
}) {
  const [local, setLocal] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])

  return (
    <input
      className={className}
      disabled={disabled}
      value={local}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focused.current = false
        const next = transform ? transform(local) : local
        setLocal(next)
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function nodeTypeLabel(type: string | undefined): string {
  if (!type) return 'unknown id'
  return type.replace(/_/g, ' ')
}

/** Canvas custom name (labels map) or group / logic-block label on the rule. */
function resolveNodeCustomName(
  target: { type: string; label?: string } | undefined,
  nodeId: string,
  nodeLabels: Record<string, string>,
): string | undefined {
  const fromMap = nodeLabels[nodeId]?.trim()
  if (fromMap) return fromMap
  if (!target) return undefined
  if (target.type === 'group' || target.type === 'logic_block_ref') {
    return target.label?.trim() || undefined
  }
  return undefined
}

function TargetBindingsEditor({
  bindings,
  readOnly,
  onChange,
  match,
  nodeLabels = {},
  allowAbsoluteValue,
  controlType = 'boolean',
  controlLiveValue,
  onSeedControlValue,
}: {
  bindings: L2ParamTargetBinding[]
  readOnly: boolean
  onChange: (next: L2ParamTargetBinding[]) => void
  match: L2RuleGroup
  /** Visual custom names keyed by node id. */
  nodeLabels?: Record<string, string>
  /** Enum options can set absolute property values when selected. */
  allowAbsoluteValue?: boolean
  controlType?: L2ParamControl['type']
  /** Live value of the Param control (for seeding empty text/list controls). */
  controlLiveValue?: L2ParamValue
  /** Fill an empty text/list control from the target when first binding. */
  onSeedControlValue?: (seed: string | string[]) => void
}) {
  const [draftId, setDraftId] = useState('')
  const [collapsedTargets, setCollapsedTargets] = useState<Record<string, boolean>>({})
  const [targetsHelpOpen, setTargetsHelpOpen] = useState(false)
  const byId = useMemo(() => indexRuleNodesById(match), [match])
  const list = bindings ?? []

  const nodeIds = useMemo(() => {
    const order: string[] = []
    const seen = new Set<string>()
    for (const b of list) {
      if (!b.nodeId || seen.has(b.nodeId)) continue
      seen.add(b.nodeId)
      order.push(b.nodeId)
    }
    return order
  }, [list])

  const bindingsFor = (nodeId: string) => list.filter((b) => b.nodeId === nodeId)

  const setBindingsFor = (nodeId: string, nextForNode: L2ParamTargetBinding[]) => {
    onChange([...list.filter((b) => b.nodeId !== nodeId), ...nextForNode])
  }

  const commitDraft = () => {
    const nodeId = draftId.trim()
    if (!nodeId) return
    if (nodeIds.includes(nodeId)) {
      setDraftId('')
      return
    }
    const target = byId.get(nodeId)
    const fields = discoverBindableFields(target)

    // Text / term-list Params: Presence does nothing — bind the matching text field.
    if (controlType === 'stringList') {
      const listField = fields.find((f) => f.valueKind === 'stringList')
      if (listField) {
        const seed = seedFromTargetField(target, listField)
        onChange([
          ...list,
          bindingFromBindableField(nodeId, listField, { listMode: 'replace' }),
        ])
        if (
          seed !== undefined &&
          isEmptyParamValue(controlLiveValue) &&
          onSeedControlValue
        ) {
          onSeedControlValue(seed)
        }
        setDraftId('')
        return
      }
    }
    if (controlType === 'string') {
      const textField = fields.find((f) => f.valueKind === 'string')
      if (textField) {
        const seed = seedFromTargetField(target, textField)
        onChange([
          ...list,
          bindingFromBindableField(nodeId, textField, { listMode: 'replace' }),
        ])
        if (
          seed !== undefined &&
          isEmptyParamValue(controlLiveValue) &&
          onSeedControlValue
        ) {
          onSeedControlValue(seed)
        }
        setDraftId('')
        return
      }
    }

    // Toggle / dropdown: default Presence (show/hide).
    onChange([...list, { nodeId, kind: 'presence' }])
    setDraftId('')
  }

  const renameNodeId = (from: string, toRaw: string) => {
    const to = toRaw.trim()
    if (!to) {
      onChange(list.filter((b) => b.nodeId !== from))
      return
    }
    if (to !== from && nodeIds.includes(to)) return
    onChange(list.map((b) => (b.nodeId === from ? { ...b, nodeId: to } : b)))
  }

  const isTextParam = controlType === 'string' || controlType === 'stringList'
  const targetsHelpText = isTextParam
    ? 'Paste a node id — we bind its Terms / Tags / Pattern / URL patterns to this Param. Edit the list on the Param; the target field locks.'
    : 'Paste a node id, choose Presence (show/hide), then which settings this control owns. Toggle/dropdown overlaps AND together.'

  return (
    <div className="l2-param-target-ids">
      <div className="l2-param-field-label-row">
        <span className="l2-param-target-ids-label">Targets</span>
        <LabelHelpButton label={targetsHelpText} onClick={() => setTargetsHelpOpen(true)} />
      </div>
      {targetsHelpOpen ? (
        <ParamHelpModal
          titleId="param-targets-help"
          title="Targets"
          onClose={() => setTargetsHelpOpen(false)}
        >
          {isTextParam ? (
            <p>
              Paste a node id — we bind its Terms / Tags / Pattern / URL patterns to this Param.
              Edit the list on the Param; the target field locks.
            </p>
          ) : (
            <p>
              Paste a node id, choose <strong>Presence</strong> (show/hide), then which settings
              this control owns. Toggle/dropdown overlaps <strong>AND</strong> together.
            </p>
          )}
        </ParamHelpModal>
      ) : null}
      {!readOnly ? (
        <div className="l2-param-target-row l2-param-target-add">
          <input
            className="mono"
            value={draftId}
            placeholder="Paste node id, then Enter"
            title={targetsHelpText}
            onChange={(e) => setDraftId(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
              }
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={commitDraft}>
            Add
          </button>
        </div>
      ) : null}
      {nodeIds.map((nodeId) => {
        const target = byId.get(nodeId)
        const nodeBindings = bindingsFor(nodeId)
        const hasPresence = nodeBindings.some((b) => b.kind === 'presence')
        const fields = discoverBindableFields(target)
        const unsupported = unsupportedInputKeysForNode(target)

        const propCount = nodeBindings.filter((b) => b.kind === 'property').length
        const expanded = !collapsedTargets[nodeId]
        const typeLabel = target ? nodeTypeLabel(target.type) : 'unknown'
        const customName = resolveNodeCustomName(target, nodeId, nodeLabels)
        return (
          <div
            key={nodeId}
            className={`l2-param-binding-card${expanded ? '' : ' is-collapsed'}`}
          >
            <div className="l2-param-binding-card-head">
              <button
                type="button"
                className="l2-param-collapse-btn"
                aria-expanded={expanded}
                onClick={() =>
                  setCollapsedTargets((prev) => ({ ...prev, [nodeId]: expanded }))
                }
              >
                <span className="l2-param-collapse-chevron" aria-hidden>
                  {expanded ? '▾' : '▸'}
                </span>
                <span className="l2-param-collapse-title">
                  {customName ? (
                    <>
                      <span className="l2-param-node-name">{customName}</span>
                      <code className="mono l2-param-node-id-sub">{nodeId}</code>
                    </>
                  ) : (
                    <code className="mono">{nodeId}</code>
                  )}
                </span>
                <span className="l2-param-collapse-meta">
                  {typeLabel}
                  {hasPresence ? ' · presence' : ''}
                  {propCount > 0 ? ` · ${propCount} setting${propCount === 1 ? '' : 's'}` : ''}
                </span>
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Remove target"
                  onClick={() => onChange(list.filter((b) => b.nodeId !== nodeId))}
                >
                  ✕
                </button>
              ) : null}
            </div>

            {expanded ? (
            <>
            <div className="l2-param-binding-target">
              <div className="l2-param-target-row">
                <BlurCommitInput
                  className="mono"
                  disabled={readOnly}
                  value={nodeId}
                  placeholder="Paste node id"
                  onCommit={(next) => renameNodeId(nodeId, next)}
                />
              </div>
              <p className="l2-param-binding-type">
                {target
                  ? customName
                    ? `Resolved: ${nodeTypeLabel(target.type)} · ${customName}`
                    : `Resolved: ${nodeTypeLabel(target.type)}`
                  : 'Not found in this graph — paste a live node id'}
              </p>
              <ToggleRow
                label="Presence — node exists when control is on"
                checked={hasPresence}
                readOnly={readOnly}
                ariaLabel={`Presence for ${nodeId}`}
                onChange={(checked) => {
                  const rest = nodeBindings.filter((b) => b.kind !== 'presence')
                  setBindingsFor(
                    nodeId,
                    checked ? [{ nodeId, kind: 'presence' }, ...rest] : rest,
                  )
                }}
              />
              {controlType === 'string' || controlType === 'stringList' ? (
                <p className="card-hint">
                  Presence is for toggles/dropdowns. For this Param, turn on{' '}
                  <strong>Terms</strong> (or Tags / Pattern) under Node settings — that is what
                  makes the list do something.
                </p>
              ) : null}
            </div>

            <ParamNodeBindProps
              nodeId={nodeId}
              target={target}
              typeLabel={typeLabel}
              fields={fields}
              nodeBindings={nodeBindings}
              readOnly={readOnly}
              controlType={controlType}
              controlLiveValue={controlLiveValue}
              allowAbsoluteValue={allowAbsoluteValue}
              onSeedControlValue={onSeedControlValue}
              setBindingsFor={setBindingsFor}
            />

            {unsupported.length > 0 ? (
              <p className="card-hint">
                Not bindable (identity / complex inputs): {unsupported.join(', ')}
              </p>
            ) : null}
            </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/** Authoring UI for a Parameter Node (control panel). */
export function ParametersNodeEditor({
  node,
  match,
  nodeLabels = {},
  feedTimezone = 'UTC',
  feedId,
  onFeedTimezoneChange,
  onChange,
  onPatchLiveParamValues,
  readOnly = false,
}: {
  node: L2ParametersCondition
  match: L2RuleGroup
  /** Visual custom names keyed by node id. */
  nodeLabels?: Record<string, string>
  /** IANA timezone for schedule windows on this feed. */
  feedTimezone?: string
  feedId?: string
  onFeedTimezoneChange?: (timezone: string) => void
  onChange: (next: L2ParametersCondition) => void
  onPatchLiveParamValues?: (values: Record<string, L2ParamValue>) => void
  readOnly?: boolean
}) {
  const controls = node.controls ?? []
  const values = node.values ?? {}
  const sharedValues = useMemo(() => buildParamValueMap(match), [match])
  const andBlockers = useMemo(() => collectParamAndBlockers(match), [match])

  const patch = (partial: Partial<L2ParametersCondition>) => {
    onChange({ ...node, ...partial })
  }

  const updateControl = (index: number, next: L2ParamControl) => {
    const prev = controls[index]
    const list = controls.map((c, i) => (i === index ? next : c))
    const nextValues = { ...values }
    if (prev && prev.name !== next.name) {
      delete nextValues[prev.name]
    }
    // Adopting a shared Param ID: take live value from the graph channel.
    if (Object.prototype.hasOwnProperty.call(sharedValues, next.name)) {
      nextValues[next.name] = sharedValues[next.name]!
    } else if (!(next.name in nextValues)) {
      nextValues[next.name] = next.default
    }
    const names = new Set(list.map((c) => c.name))
    for (const key of Object.keys(nextValues)) {
      if (!names.has(key)) delete nextValues[key]
    }
    patch({ controls: list, values: nextValues })
  }

  const removeControl = (index: number) => {
    const removed = controls[index]
    const list = controls.filter((_, i) => i !== index)
    const nextValues = { ...values }
    if (removed) delete nextValues[removed.name]
    patch({ controls: list, values: nextValues })
  }

  const addControl = (factory: () => L2ParamControl) => {
    const c = factory()
    patch({
      controls: [...controls, c],
      values: { ...values, [c.name]: c.default },
    })
  }

  const setLiveValue = (name: string, value: L2ParamValue) => {
    const list = controls.map((c) => (c.name === name ? { ...c, default: value } : c))
    patch({ controls: list, values: { ...values, [name]: value } })
    const ctrl = list.find((c) => c.name === name)
    if (ctrl && resolveParamRuntimeMode(ctrl) === 'live') {
      onPatchLiveParamValues?.({ [name]: value })
    }
  }

  return (
    <div className="l2-parameters-editor">
      <label className="l2-inspector-field">
        Panel title
        <BlurCommitInput
          value={node.title ?? ''}
          disabled={readOnly}
          onCommit={(title) => patch({ title })}
          placeholder="Parameters"
        />
      </label>

      {!readOnly ? (
        <div className="l2-parameters-add-row">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addControl(newBooleanControl)}>
            Add toggle
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addControl(newEnumControl)}>
            Add dropdown
          </button>
        </div>
      ) : null}

      <p className="card-hint">
        Shared Param IDs stay fully in sync. To drive keyword Terms: use a <strong>Toggle</strong>,
        bind Terms, and set replace or merge.
      </p>

      {controls.length === 0 ? (
        <p className="l2-parameters-empty">No controls yet. Add a toggle or dropdown.</p>
      ) : null}

      {controls.map((control, index) => (
        <ParamControlCard
          key={control.name || `param-control-${index}`}
          control={control}
          liveValue={sharedValues[control.name] ?? values[control.name] ?? control.default}
          andBlockInfo={andBlockers.get(control.name)}
          readOnly={readOnly}
          match={match}
          panelId={node.id}
          nodeLabels={nodeLabels}
          feedTimezone={feedTimezone}
          feedId={feedId}
          onFeedTimezoneChange={onFeedTimezoneChange}
          onPatchLiveParamValues={onPatchLiveParamValues}
          onChange={(next) => updateControl(index, next)}
          onRemove={() => removeControl(index)}
          onLiveValue={(v) => setLiveValue(control.name, v)}
        />
      ))}
    </div>
  )
}

function ParamControlCard({
  control,
  liveValue,
  readOnly,
  match,
  panelId,
  nodeLabels = {},
  andBlockInfo,
  feedTimezone,
  feedId,
  onFeedTimezoneChange,
  onPatchLiveParamValues,
  onChange,
  onRemove,
  onLiveValue,
}: {
  control: L2ParamControl
  liveValue: L2ParamValue
  readOnly: boolean
  match: L2RuleGroup
  panelId: string
  nodeLabels?: Record<string, string>
  andBlockInfo?: ParamAndBlockInfo
  feedTimezone?: string
  feedId?: string
  onFeedTimezoneChange?: (timezone: string) => void
  onPatchLiveParamValues?: (values: Record<string, L2ParamValue>) => void
  onChange: (next: L2ParamControl) => void
  onRemove: () => void
  onLiveValue: (value: L2ParamValue) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [syncHelpOpen, setSyncHelpOpen] = useState(false)
  const [triggersOpen, setTriggersOpen] = useState(false)
  const patch = (partial: Partial<L2ParamControl>) => onChange({ ...control, ...partial })
  const bindings = normalizeControlBindings(control)
  const targetCount = new Set(bindings.map((b) => b.nodeId).filter(Boolean)).size
  const kindLabel = controlKindLabel(control.type)
  const title = control.label?.trim() || control.name
  const sharedPanels = countParamControlPanels(match, control.name)
  const isShared = sharedPanels > 1
  const liveOn = liveValue === true || liveValue === 'true'
  const andBlocked = Boolean(andBlockInfo && liveOn)
  const triggerCount = triggersForControl(control).length
  const canSchedule = control.type === 'boolean' || control.type === 'enum'

  const linkableIds = useMemo(() => {
    const out: { name: string; label: string; panelTitle: string }[] = []
    const seen = new Set<string>()
    for (const panel of collectParameterNodes(match)) {
      if (panel.id === panelId) continue
      for (const c of panel.controls ?? []) {
        if (!c.name || c.name === control.name || seen.has(c.name)) continue
        seen.add(c.name)
        out.push({
          name: c.name,
          label: c.label?.trim() || c.name,
          panelTitle: panel.title?.trim() || 'Parameters',
        })
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label))
  }, [match, panelId, control.name])

  const adoptFromCanonical = (name: string, canonical: L2ParamControl) => {
    onChange({
      ...control,
      name,
      label: canonical.label,
      description: canonical.description,
      type: canonical.type,
      default: canonical.default,
      placeholder: canonical.placeholder,
      options: canonical.options ? structuredClone(canonical.options) : undefined,
      bindings: canonical.bindings ? structuredClone(canonical.bindings) : [],
      runtimeMode: canonical.runtimeMode,
      targetNodeIds: undefined,
    })
  }

  const commitParamId = (rawName: string) => {
    const name = rawName.trim().replace(/\s+/g, '_')
    if (!name || name === control.name) return
    const canonical = findParamControlByName(match, name, { excludePanelId: panelId })
    if (canonical) {
      adoptFromCanonical(name, canonical)
      return
    }
    patch({ name })
  }

  const linkToParam = (name: string) => {
    const canonical = findParamControlByName(match, name, { excludePanelId: panelId })
    if (canonical) adoptFromCanonical(name, canonical)
    setLinkModalOpen(false)
  }

  const copyParamId = async () => {
    try {
      await navigator.clipboard.writeText(control.name)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`l2-param-control-card${expanded ? '' : ' is-collapsed'}`}>
      <div className="l2-param-control-card-head">
        <button
          type="button"
          className="l2-param-collapse-btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="l2-param-collapse-chevron" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
          <strong>{kindLabel}</strong>
          <span className="l2-param-collapse-title">{title}</span>
          {!expanded ? (
            <span className="l2-param-collapse-meta">
              {isShared ? `shared · ${sharedPanels} panels · ` : ''}
              {targetCount === 0
                ? 'no targets'
                : `${targetCount} target${targetCount === 1 ? '' : 's'}`}
            </span>
          ) : null}
        </button>
        <div className="l2-param-control-card-head-actions">
          {canSchedule ? (
            <ParamTriggersButton
              scheduleCount={triggerCount}
              onClick={() => setTriggersOpen(true)}
            />
          ) : null}
          {control.type === 'boolean' ? (
            <div className="l2-param-head-live" title="Live value for this feed (same as canvas)">
              <ToggleSwitch
                checked={liveOn}
                readOnly={readOnly}
                andBlocked={andBlocked}
                paramProduction={resolveParamRuntimeMode(control) === 'live'}
                ariaLabel={`${control.label || control.name} live value`}
                onChange={(checked) => onLiveValue(checked)}
              />
            </div>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm l2-param-remove-btn"
              title="Remove control"
              aria-label="Remove control"
              onClick={onRemove}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
      <div className="l2-param-control-card-body">
      {control.type === 'boolean' && andBlocked && andBlockInfo ? (
        <pre className="l2-param-and-block-hint">
          {formatParamAndBlockHint(andBlockInfo, {
            nodeLabels,
            match,
          })}
        </pre>
      ) : null}
      <div className="l2-param-field-row">
        <div className="l2-inspector-field">
          <div className="l2-param-field-label-row">
            <span>Param ID</span>
            <LabelHelpButton
              label="How Param ID sync works"
              onClick={() => setSyncHelpOpen(true)}
            />
          </div>
          <div className="l2-param-id-row">
            <BlurCommitInput
              value={control.name}
              disabled={readOnly}
              className="mono"
              transform={(raw) => raw.trim().replace(/\s+/g, '_')}
              onCommit={commitParamId}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm l2-param-copy-btn"
              title={copied ? 'Copied' : 'Copy Param ID'}
              aria-label={copied ? 'Copied' : 'Copy Param ID'}
              onClick={() => void copyParamId()}
            >
              <CopyIcon done={copied} />
            </button>
          </div>
          {isShared ? (
            <span className="l2-param-shared-hint">
              Shared across {sharedPanels} panels — fully synced
            </span>
          ) : null}
          {!readOnly && linkableIds.length > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm l2-param-link-existing-btn"
              onClick={() => setLinkModalOpen(true)}
            >
              Link existing…
            </button>
          ) : null}
        </div>
        <label className="l2-inspector-field">
          Label
          <BlurCommitInput
            value={control.label}
            disabled={readOnly}
            onCommit={(label) => patch({ label })}
          />
        </label>
      </div>

      {syncHelpOpen ? (
        <ParamHelpModal
          titleId={`param-sync-help-${control.name}`}
          title="Sync with another toggle"
          onClose={() => setSyncHelpOpen(false)}
        >
          <p>
            Copy this Param ID (or use <strong>Link existing…</strong>) to fully sync with another
            toggle — same live value, label, description, and targets.
          </p>
        </ParamHelpModal>
      ) : null}

      {linkModalOpen
        ? createPortal(
            <div
              className="l2-param-modal-backdrop"
              role="presentation"
              onClick={() => setLinkModalOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setLinkModalOpen(false)
              }}
            >
              <div
                className="l2-param-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`param-link-title-${control.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id={`param-link-title-${control.name}`}>Link to existing Param ID</h3>
                <p>
                  This toggle becomes a synced copy of the one you pick — same live value, label,
                  description, and targets.
                </p>
                <ul className="l2-param-modal-list">
                  {linkableIds.map((item) => (
                    <li key={item.name}>
                      <button
                        type="button"
                        className="l2-param-modal-choice"
                        onClick={() => linkToParam(item.name)}
                      >
                        <strong>{item.label}</strong>
                        <span className="mono">{item.name}</span>
                        <span className="l2-param-modal-choice-meta">{item.panelTitle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="l2-param-modal-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setLinkModalOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <ParamTriggersModal
        open={triggersOpen}
        control={control}
        match={match}
        nodeLabels={nodeLabels}
        feedTimezone={feedTimezone ?? 'UTC'}
        paramRuntimeMode={resolveParamRuntimeMode(control)}
        readOnly={readOnly}
        onChange={(triggers) => patch({ triggers, schedules: undefined })}
        onFeedTimezoneChange={onFeedTimezoneChange}
        onClose={() => setTriggersOpen(false)}
      />

      <label className="l2-inspector-field">
        Runtime mode
        <select
          disabled={readOnly}
          value={resolveParamRuntimeMode(control)}
          onChange={(e) => patch({ runtimeMode: e.target.value as L2ParamRuntimeMode })}
        >
          <option value="draft">Draft — editor preview (blue)</option>
          <option value="live">Live — writes production (teal)</option>
        </select>
        <span className="card-hint">
          Draft toggles react in the editor only. Live toggles, triggers (when Live), and API write the
          published feed.
        </span>
      </label>

      <label className="l2-inspector-field">
        Description
        <BlurCommitInput
          value={control.description ?? ''}
          disabled={readOnly}
          onCommit={(description) => patch({ description })}
          placeholder="Shown to consumers"
        />
      </label>

      {control.type === 'boolean' ? (
        <TargetBindingsEditor
          bindings={bindings}
          readOnly={readOnly}
          match={match}
          nodeLabels={nodeLabels}
          controlType="boolean"
          controlLiveValue={liveValue}
          onChange={(next) => patch({ bindings: next, targetNodeIds: undefined })}
        />
      ) : control.type === 'string' ? (
        <>
          <p className="card-hint">
            Single string for consumers. Bind to a regex <strong>Pattern</strong> (or text Value) —
            not keyword Terms (use Term list for those).
          </p>
          <label className="l2-inspector-field">
            Value (this feed)
            <BlurCommitInput
              value={String(liveValue ?? '')}
              disabled={readOnly}
              placeholder={control.placeholder || 'text'}
              onCommit={(v) => onLiveValue(v)}
            />
          </label>
          <TargetBindingsEditor
            bindings={bindings}
            readOnly={readOnly}
            match={match}
            nodeLabels={nodeLabels}
            controlType="string"
            controlLiveValue={liveValue}
            onSeedControlValue={(seed) => onLiveValue(Array.isArray(seed) ? seed.join(' ') : seed)}
            onChange={(next) => patch({ bindings: next, targetNodeIds: undefined })}
          />
        </>
      ) : control.type === 'stringList' ? (
        <>
          <p className="card-hint">
            Edit terms here, then bind <strong>Terms</strong> / <strong>Tags</strong> /{' '}
            <strong>URL patterns</strong> on a target. The target field locks — this list is the
            source of truth.
          </p>
          <div className="l2-inspector-field">
            <span>Terms (this feed)</span>
            <TermListEditor
              terms={
                Array.isArray(liveValue)
                  ? liveValue
                  : Array.isArray(control.default)
                    ? control.default
                    : []
              }
              readOnly={readOnly}
              placeholder={control.placeholder || 'term'}
              itemNoun="term"
              onChange={(list) => onLiveValue(list)}
            />
          </div>
          <TargetBindingsEditor
            bindings={bindings}
            readOnly={readOnly}
            match={match}
            nodeLabels={nodeLabels}
            controlType="stringList"
            controlLiveValue={liveValue}
            onSeedControlValue={(seed) =>
              onLiveValue(Array.isArray(seed) ? seed : seed ? [seed] : [])
            }
            onChange={(next) => patch({ bindings: next, targetNodeIds: undefined })}
          />
        </>
      ) : (
        <EnumOptionsEditor
          control={control}
          liveValue={String(liveValue)}
          readOnly={readOnly}
          match={match}
          nodeLabels={nodeLabels}
          onChange={onChange}
          onLiveValue={(v) => onLiveValue(v)}
        />
      )}
      </div>
      ) : null}
    </div>
  )
}

function EnumOptionsEditor({
  control,
  liveValue,
  readOnly,
  match,
  nodeLabels = {},
  onChange,
  onLiveValue,
}: {
  control: L2ParamControl
  liveValue: string
  readOnly: boolean
  match: L2RuleGroup
  nodeLabels?: Record<string, string>
  onChange: (next: L2ParamControl) => void
  onLiveValue: (value: string) => void
}) {
  const options = control.options ?? []

  const setOptions = (next: L2ParamEnumOption[]) => {
    const defaultValue =
      next.some((o) => o.value === control.default) ? control.default : (next[0]?.value ?? '')
    onChange({ ...control, options: next, default: defaultValue })
  }

  const updateOption = (index: number, partial: Partial<L2ParamEnumOption>) => {
    setOptions(options.map((o, i) => (i === index ? { ...o, ...partial } : o)))
  }

  return (
    <>
      <label className="l2-inspector-field">
        Selected option (this feed)
        <select
          disabled={readOnly || options.length === 0}
          value={liveValue}
          onChange={(e) => onLiveValue(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      </label>

      {options.map((opt, index) => (
        <div key={`enum-opt-${index}`} className="l2-param-enum-option">
          <div className="l2-param-field-row">
            <label className="l2-inspector-field">
              Value
              <BlurCommitInput
                className="mono"
                value={opt.value}
                disabled={readOnly}
                transform={(raw) => raw.trim().replace(/\s+/g, '_')}
                onCommit={(value) => {
                  if (value) updateOption(index, { value })
                }}
              />
            </label>
            <label className="l2-inspector-field">
              Label
              <BlurCommitInput
                value={opt.label}
                disabled={readOnly}
                onCommit={(label) => updateOption(index, { label })}
              />
            </label>
          </div>
          <TargetBindingsEditor
            bindings={normalizeOptionBindings(opt)}
            readOnly={readOnly}
            match={match}
            nodeLabels={nodeLabels}
            allowAbsoluteValue
            controlType="enum"
            onChange={(bindings) => updateOption(index, { bindings, targetNodeIds: [] })}
          />
          {!readOnly ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={options.length <= 1}
              onClick={() => setOptions(options.filter((_, i) => i !== index))}
            >
              Remove option
            </button>
          ) : null}
        </div>
      ))}

      {!readOnly ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            setOptions([
              ...options,
              {
                value: `opt_${options.length + 1}`,
                label: `Option ${options.length + 1}`,
                targetNodeIds: [],
                bindings: [],
              },
            ])
          }
        >
          Add option
        </button>
      ) : null}
    </>
  )
}

/** Consumer-facing controls for a logic_block_ref (schema from packaged root). */
export function LogicBlockParamValuesEditor({
  controls,
  values,
  onChange,
  readOnly = false,
}: {
  controls: L2ParamControl[]
  values: Record<string, L2ParamValue>
  onChange: (next: Record<string, L2ParamValue>) => void
  readOnly?: boolean
}) {
  if (controls.length === 0) {
    return <p className="card-hint">This logic block has no parameters.</p>
  }

  return (
    <div className="l2-parameters-consumer">
      {controls.map((control) => {
        const value = values[control.name] ?? control.default
        return (
          <label key={control.name} className="l2-inspector-field">
            <span>{control.label || control.name}</span>
            {control.description ? <span className="card-hint">{control.description}</span> : null}
            {control.type === 'boolean' ? (
              <ToggleRow
                label={value === true || value === 'true' ? 'On' : 'Off'}
                checked={value === true || value === 'true'}
                readOnly={readOnly}
                ariaLabel={control.label || control.name}
                onChange={(checked) => onChange({ ...values, [control.name]: checked })}
              />
            ) : control.type === 'string' ? (
              <BlurCommitInput
                value={String(value ?? '')}
                disabled={readOnly}
                placeholder={control.placeholder || ''}
                onCommit={(next) => onChange({ ...values, [control.name]: next })}
              />
            ) : control.type === 'stringList' ? (
              <TermListEditor
                terms={Array.isArray(value) ? value : []}
                readOnly={readOnly}
                placeholder={control.placeholder || 'term'}
                itemNoun="item"
                onChange={(list) => onChange({ ...values, [control.name]: list })}
              />
            ) : (
              <select
                disabled={readOnly}
                value={String(value)}
                onChange={(e) => onChange({ ...values, [control.name]: e.target.value })}
              >
                {(control.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label || o.value}
                  </option>
                ))}
              </select>
            )}
          </label>
        )
      })}
    </div>
  )
}
