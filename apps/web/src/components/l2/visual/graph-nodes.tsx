import { type SyntheticEvent, useLayoutEffect, useRef } from 'react'
import { type Node, type NodeProps, Handle, Position } from '@xyflow/react'
import type { L2NodeProvenance, L2ParametersCondition, L2RuleNode } from '@cfb/core-types'
import {
  COND_TEASER_MAX,
  conditionCollapseMetrics,
  conditionExpandMetrics,
  getConditionExpandBodyHeight,
  setConditionExpandBodyHeight,
  usesPropertiesStyleExpand,
} from '@cfb/l2-graph'
import { ingestRoleBadgeFor } from '../../../lib/l2-ingest-badge'
import {
  collectParamPropertyLocks,
  overlayParamLockedValues,
  paramLockSummary,
  paramLockedPropertySet,
  restoreParamLockedValues,
} from '../../../lib/param-bind-preview'
import { NodeRoleIcon } from '../NodeRoleIcon'
import { ToggleRow } from '../../ToggleRow'
import { ConditionRow } from '../ConditionRow'
import { useNodeExpand } from './node-expand-context'
import { ConditionExpandProfiles } from './ConditionExpandProfiles'
import { LogicBlockExpandOutline } from './LogicBlockExpandOutline'
import { applyParametersToMatch, indexRuleNodesById } from '@cfb/l2-graph'

export type GraphNodeData = {
  label: string
  title?: string
  customName?: string
  subtitle?: string
  logic?: string
  nodeId: string
  selected?: boolean
  ruleType?: L2RuleNode['type']
  rule?: L2RuleNode
  groupLogic?: string
  isRoot?: boolean
  traceOutcome?: 'pass' | 'fail' | 'skip' | 'bypass_remaining'
  showPorts?: boolean
  nested?: boolean
  topLevel?: boolean
  draggableFrame?: boolean
  dropTarget?: boolean
  extracting?: boolean
  extractOriginParentId?: string
  nodeProvenance?: L2NodeProvenance
  /** Excluded by a Parameter control — greyed on canvas. */
  paramDisabled?: boolean
  /** Node after Parameter property patches (for badges / live preview). */
  effectiveRule?: L2RuleNode
  /** Targeted by at least one Parameter Presence or property bind. */
  paramDriven?: boolean
  /** Leaf body expanded (keyword terms, …). Default false. */
  expanded?: boolean
  /** Locked: skip group expand/collapse-all; block delete / extract / reparent. */
  locked?: boolean
  /** Group: any descendant leaf is expanded. */
  contentsExpanded?: boolean
  /** Group: has at least one leaf that can expand. */
  hasExpandableContents?: boolean
}

function stopNodeGesture(e: SyntheticEvent) {
  e.stopPropagation()
}

function NodeLockButton({
  nodeId,
  locked,
}: {
  nodeId: string
  locked: boolean
}) {
  const expandApi = useNodeExpand()
  if (!expandApi || expandApi.readOnly) return null
  return (
    <button
      type="button"
      className={`l2-flow-condition-lock nodrag nopan${locked ? ' is-locked' : ''}`}
      title={
        locked
          ? 'Unlock — allow move, delete, and group expand/collapse'
          : 'Lock — pin position; keep expand state; prevent deletion'
      }
      aria-label={locked ? 'Unlock node' : 'Lock node'}
      aria-pressed={locked}
      onMouseDown={stopNodeGesture}
      onClick={(e) => {
        stopNodeGesture(e)
        expandApi.toggleLocked(nodeId)
      }}
    >
      {locked ? (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path
            fill="currentColor"
            d="M8 1.5A2.75 2.75 0 0 0 5.25 4.25V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.75V4.25A2.75 2.75 0 0 0 8 1.5zm1.25 4.5h-2.5V4.25a1.25 1.25 0 1 1 2.5 0V6z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
          <path
            fill="currentColor"
            d="M8 1.5A2.75 2.75 0 0 0 5.25 4.25V5h1.5V4.25a1.25 1.25 0 1 1 2.5 0V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.75V4.25A2.75 2.75 0 0 0 8 1.5z"
          />
        </svg>
      )}
    </button>
  )
}

export function StartNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`l2-flow-node l2-flow-start ${data.selected ? 'selected' : ''}`}>
      <Handle type="source" position={Position.Right} className="l2-flow-handle" />
      <span className="l2-flow-endpoint-icon" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M4 2.5v11l9-5.5L4 2.5z" />
        </svg>
      </span>
      <span className="l2-flow-endpoint-label">{data.label}</span>
    </div>
  )
}

export function SourceNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`l2-flow-node l2-flow-source ${data.selected ? 'selected' : ''}`}>
      <Handle type="source" position={Position.Right} className="l2-flow-handle" />
      <span className="l2-flow-source-label">{data.label}</span>
    </div>
  )
}

export function EndNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`l2-flow-node l2-flow-end ${data.selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="l2-flow-handle" />
      <span className="l2-flow-endpoint-icon" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <rect x="2" y="2.5" width="12" height="2.25" rx="1.1" />
          <rect x="2" y="6.75" width="9" height="2.25" rx="1.1" />
          <rect x="2" y="11" width="6" height="2.25" rx="1.1" />
        </svg>
      </span>
      <span className="l2-flow-endpoint-label">{data.label}</span>
    </div>
  )
}

export function GroupFrameNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const expandApi = useNodeExpand()
  const logicClass =
    data.groupLogic === 'any'
      ? 'logic-any'
      : data.groupLogic === 'n_of'
        ? 'logic-nof'
        : data.groupLogic === 'none'
          ? 'logic-none'
          : 'logic-all'
  const traceClass = data.traceOutcome ? `trace-${data.traceOutcome}` : ''
  const title = data.title ?? data.label
  const customName = data.customName?.trim()
  const groupId = data.nodeId
  const contentsExpanded = Boolean(data.contentsExpanded)
  const showFold =
    Boolean(expandApi && !expandApi.readOnly && data.hasExpandableContents)

  return (
    <div
      className={`l2-group-frame ${logicClass} ${data.isRoot ? 'l2-group-frame-root' : ''} ${data.topLevel ? 'l2-group-frame-top' : ''} ${data.draggableFrame ? 'l2-group-frame-draggable' : ''} ${data.dropTarget ? 'l2-group-frame-drop-target' : ''} ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${data.paramDisabled ? 'is-param-disabled' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
    >
      {data.showPorts && (
        <>
          <Handle type="target" position={Position.Left} className="l2-flow-handle" id="in" />
          <Handle type="source" position={Position.Right} className="l2-flow-handle" id="out" />
        </>
      )}
      <div className="l2-group-frame-header">
        <span className="l2-group-frame-logic">{title}</span>
        <span className={`l2-group-frame-name${customName ? ' has-name' : ''}`}>
          {customName ?? '\u00A0'}
        </span>
        <span className="l2-group-frame-actions">
          <NodeLockButton nodeId={groupId} locked={Boolean(data.locked)} />
          {showFold ? (
            <button
              type="button"
              className={`l2-group-frame-fold nodrag nopan${contentsExpanded ? ' is-expanded' : ''}`}
              title={contentsExpanded ? 'Collapse nested nodes' : 'Expand nested nodes'}
              aria-label={contentsExpanded ? 'Collapse nested nodes' : 'Expand nested nodes'}
              aria-expanded={contentsExpanded}
              onMouseDown={stopNodeGesture}
              onClick={(e) => {
                stopNodeGesture(e)
                if (contentsExpanded) expandApi?.collapseAllInGroup(groupId)
                else expandApi?.expandAllInGroup(groupId)
              }}
            >
              <span className="l2-group-frame-fold-label">
                {contentsExpanded ? 'Collapse' : 'Expand'}
              </span>
              <span className="l2-group-frame-fold-chevron" aria-hidden>
                {contentsExpanded ? '▾' : '▸'}
              </span>
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function TextBodyLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="l2-flow-condition-body-list">
      {lines.map((line, i) => (
        <li key={`${i}-${line}`} className="l2-flow-condition-body-line" title={line}>
          {line}
        </li>
      ))}
    </ul>
  )
}

/** Interactive toggles / dropdowns on an expanded Parameter Node. */
function ParametersExpandControls({ rule }: { rule: L2ParametersCondition }) {
  const expandApi = useNodeExpand()
  const controls = rule.controls ?? []
  const values = rule.values ?? {}
  const readOnly = Boolean(expandApi?.readOnly) || !expandApi?.patchParameterValues

  if (controls.length === 0) {
    return <span className="l2-flow-condition-body-empty">No controls yet</span>
  }

  const setValue = (name: string, value: boolean | string) => {
    expandApi?.patchParameterValues?.(rule.id, { ...values, [name]: value })
  }

  return (
    <div
      className="l2-flow-parameters-controls nodrag nopan"
      onMouseDown={stopNodeGesture}
    >
      {controls.map((control) => {
        const live = values[control.name] ?? control.default
        if (control.type === 'boolean') {
          const on = live === true || live === 'true'
          return (
            <div key={control.name} className="l2-flow-parameters-control-row">
              <ToggleRow
                label={control.label || control.name}
                hint={control.description || undefined}
                checked={on}
                readOnly={readOnly}
                ariaLabel={`${control.label || control.name} parameter`}
                onChange={(checked) => setValue(control.name, checked)}
              />
            </div>
          )
        }
        return (
          <div key={control.name} className="l2-flow-parameters-control-row l2-flow-parameters-enum-row">
            <label className="l2-flow-parameters-enum-head">
              <span className="l2-flow-parameters-enum-label" title={control.description || control.name}>
                {control.label || control.name}
              </span>
              <select
                className="nodrag nopan"
                disabled={readOnly}
                value={String(live)}
                onMouseDown={stopNodeGesture}
                onChange={(e) => {
                  stopNodeGesture(e)
                  setValue(control.name, e.target.value)
                }}
              >
                {(control.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label || o.value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )
      })}
    </div>
  )
}

/** Collapsed “+N more” — expands the node (same as the ▸ control). */
function TeaserPlusMore({
  label,
  onExpand,
}: {
  label: string
  onExpand?: () => void
}) {
  if (!onExpand) {
    return (
      <div className="l2-flow-condition-body-line l2-flow-profile-list-meta">{label}</div>
    )
  }
  return (
    <button
      type="button"
      className="l2-flow-condition-body-line l2-flow-profile-list-meta l2-flow-profile-more-btn nodrag nopan"
      title="Expand"
      onMouseDown={stopNodeGesture}
      onClick={(e) => {
        stopNodeGesture(e)
        onExpand()
      }}
    >
      {label}
    </button>
  )
}

function ConditionExpandBody({
  rule,
  nodeId,
}: {
  rule?: L2RuleNode
  nodeId: string
}) {
  const expandApi = useNodeExpand()
  if (!rule) return null
  const metrics = conditionExpandMetrics(rule)
  const openProps =
    expandApi && !expandApi.readOnly && expandApi.openProperties
      ? () => expandApi.openProperties?.(nodeId)
      : undefined

  if (rule.type === 'mention') {
    return (
      <>
        <TextBodyLines lines={metrics.textLines.filter((l) => !l.startsWith('+'))} />
        <ConditionExpandProfiles
          actors={rule.accounts}
          onPlusMoreClick={openProps}
        />
      </>
    )
  }

  if (rule.type === 'author') {
    if (rule.listId) {
      return (
        <ConditionExpandProfiles listId={rule.listId} onPlusMoreClick={openProps} />
      )
    }
    return (
      <ConditionExpandProfiles actors={rule.dids} onPlusMoreClick={openProps} />
    )
  }

  if (rule.type === 'follow_ring') {
    const isViewer = (rule.hubSource ?? 'account') === 'viewer'
    const hub = rule.hub?.trim()
    return (
      <>
        {!isViewer && hub ? <ConditionExpandProfiles actors={[hub]} /> : null}
        <TextBodyLines lines={metrics.textLines} />
      </>
    )
  }

  if (rule.type === 'logic_block_ref') {
    return (
      <LogicBlockExpandOutline
        packageId={rule.packageId}
        versionPin={rule.versionPin}
        updatePolicy={rule.updatePolicy}
      />
    )
  }

  if (rule.type === 'parameters') {
    return <ParametersExpandControls rule={rule} />
  }

  if (usesPropertiesStyleExpand(rule.type)) {
    return <ConditionExpandProperties rule={rule} nodeId={nodeId} />
  }

  if (metrics.textLines.length === 0) {
    return <span className="l2-flow-condition-body-empty">Nothing to show</span>
  }
  return <TextBodyLines lines={metrics.textLines} />
}

/** Full Properties form on the canvas — same controls as the inspector. */
function ConditionExpandProperties({
  rule,
  nodeId,
}: {
  rule: L2RuleNode
  nodeId: string
}) {
  const expandApi = useNodeExpand()
  const bodyRef = useRef<HTMLDivElement>(null)
  const match = expandApi?.match
  const readOnly = Boolean(expandApi?.readOnly) || !expandApi?.patchRuleNode

  const locks = match ? collectParamPropertyLocks(match, nodeId) : []
  const effective = match
    ? indexRuleNodesById(applyParametersToMatch(match)).get(nodeId)
    : undefined
  const display = overlayParamLockedValues(rule, effective, locks)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      const prev = getConditionExpandBodyHeight(nodeId)
      if (prev !== undefined && Math.abs(prev - h) < 2) return
      setConditionExpandBodyHeight(nodeId, h)
      expandApi?.requestLayoutRefresh?.()
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [nodeId, expandApi, display, locks.length, readOnly])

  return (
    <div
      ref={bodyRef}
      className="l2-flow-condition-props nodrag nopan"
      onMouseDown={stopNodeGesture}
    >
      <ConditionRow
        node={display}
        onChange={(next) => {
          if (!match || !expandApi?.patchRuleNode) return
          const authored = restoreParamLockedValues(next, rule, locks)
          expandApi.patchRuleNode(nodeId, authored)
        }}
        onRemove={() => undefined}
        showRemove={false}
        canvasEmbed
        readOnly={readOnly}
        paramLockedProps={paramLockedPropertySet(locks)}
        paramLockHint={locks.length ? paramLockSummary(locks) : undefined}
      />
    </div>
  )
}

/** Collapsed teaser — under rename slot; never uses the custom-name row. */
function ConditionTeaserBody({
  rule,
  nodeId,
}: {
  rule?: L2RuleNode
  nodeId: string
}) {
  const expandApi = useNodeExpand()
  if (!rule) return null
  const metrics = conditionCollapseMetrics(rule)
  if (metrics.textLines.length === 0 && metrics.profileRows === 0) return null

  const onExpand =
    expandApi && !expandApi.readOnly
      ? () => expandApi.toggleExpanded(nodeId)
      : undefined

  if (rule.type === 'mention') {
    const metaLines = metrics.textLines.filter((l) => !l.startsWith('+'))
    const plusLine = metrics.textLines.find((l) => l.startsWith('+'))
    return (
      <div className="l2-flow-condition-teaser">
        <TextBodyLines lines={metaLines} />
        <ConditionExpandProfiles
          actors={rule.accounts}
          maxVisible={COND_TEASER_MAX}
          hidePlusMore
        />
        {plusLine ? <TeaserPlusMore label={plusLine} onExpand={onExpand} /> : null}
      </div>
    )
  }

  if (rule.type === 'author') {
    if (rule.listId) {
      const metaLines = metrics.textLines.filter((l) => !l.startsWith('+'))
      return (
        <div className="l2-flow-condition-teaser">
          <TextBodyLines lines={metaLines} />
          <ConditionExpandProfiles
            listId={rule.listId}
            maxVisible={COND_TEASER_MAX}
            showListMeta={false}
            onPlusMoreClick={onExpand}
            plusMoreTitle="Expand"
          />
        </div>
      )
    }
    const plusLine = metrics.textLines.find((l) => l.startsWith('+'))
    return (
      <div className="l2-flow-condition-teaser">
        <ConditionExpandProfiles
          actors={rule.dids}
          maxVisible={COND_TEASER_MAX}
          hidePlusMore
        />
        {plusLine ? <TeaserPlusMore label={plusLine} onExpand={onExpand} /> : null}
      </div>
    )
  }

  if (rule.type === 'follow_ring') {
    const isViewer = (rule.hubSource ?? 'account') === 'viewer'
    const hub = rule.hub?.trim()
    return (
      <div className="l2-flow-condition-teaser">
        {!isViewer && hub ? (
          <ConditionExpandProfiles actors={[hub]} maxVisible={1} />
        ) : null}
        <TextBodyLines lines={metrics.textLines} />
      </div>
    )
  }

  return (
    <div className="l2-flow-condition-teaser">
      <TextBodyLines lines={metrics.textLines} />
    </div>
  )
}

export function ConditionNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const expandApi = useNodeExpand()
  const traceClass = data.traceOutcome ? `trace-${data.traceOutcome}` : ''
  const header = data.title ?? data.label
  const badgeRule = data.effectiveRule ?? data.rule
  const ingestBadges = badgeRule ? ingestRoleBadgeFor(badgeRule) : []
  const customName = data.customName?.trim()
  const provenance = data.nodeProvenance ?? 'native'
  const provenanceClass =
    provenance === 'native' ? '' : `l2-flow-provenance-${provenance}`
  const expanded = Boolean(data.expanded)
  const canToggle = Boolean(expandApi && !expandApi.readOnly)

  return (
    <div
      className={`l2-flow-node l2-flow-condition ${expanded ? 'is-expanded' : ''} ${data.locked ? 'is-locked' : ''} ${provenanceClass} ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${data.paramDisabled ? 'is-param-disabled' : ''} ${data.paramDriven ? 'is-param-driven' : ''} ${data.ruleType === 'parameters' ? 'l2-flow-parameters' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
    >
      {data.showPorts && (
        <>
          <Handle type="target" position={Position.Left} className="l2-flow-handle" id="in" />
          <Handle type="source" position={Position.Right} className="l2-flow-handle" id="out" />
        </>
      )}
      <div className="l2-flow-condition-head">
        {canToggle ? (
          <button
            type="button"
            className="l2-flow-condition-expand nodrag nopan"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse node' : 'Expand node'}
            onMouseDown={stopNodeGesture}
            onClick={(e) => {
              stopNodeGesture(e)
              expandApi?.toggleExpanded(data.nodeId)
            }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : null}
        <span className="l2-flow-condition-title">{header}</span>
        {data.rule?.type === 'logic_block_ref' ? (
          <span className="l2-flow-condition-version" title={`Logic block v${data.rule.versionPin}`}>
            v{data.rule.versionPin}
          </span>
        ) : null}
        {data.paramDriven ? (
          <span
            className="l2-flow-condition-param-badge"
            title="Driven by a Parameter control (Presence and/or properties)"
          >
            Param
          </span>
        ) : null}
        {provenance === 'custom_code' ? (
          <span className="l2-flow-condition-code-badge" aria-hidden="true">
            {'{ }'}
          </span>
        ) : null}
        {provenance === 'collection' ? (
          <span className="l2-flow-condition-source-badge" title="From my collection">
            ★
          </span>
        ) : null}
        {provenance === 'subscription' ? (
          <span className="l2-flow-condition-source-badge" title="Subscribed block">
            Sub
          </span>
        ) : null}
        {ingestBadges.map((role) => (
          <NodeRoleIcon key={role} role={role} />
        ))}
        <NodeLockButton nodeId={data.nodeId} locked={Boolean(data.locked)} />
      </div>
      <span className={`l2-flow-condition-name${customName ? ' has-name' : ''}`}>
        {customName ?? '\u00A0'}
      </span>
      {expanded ? (
        <div className="l2-flow-condition-body">
          <ConditionExpandBody rule={data.rule} nodeId={data.nodeId} />
        </div>
      ) : (
        <ConditionTeaserBody rule={data.rule} nodeId={data.nodeId} />
      )}
    </div>
  )
}

export function ScoreNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const expandApi = useNodeExpand()
  const traceClass = data.traceOutcome ? `trace-${data.traceOutcome}` : ''
  const customName = data.customName?.trim()
  const provenance = data.nodeProvenance ?? 'native'
  const provenanceClass =
    provenance === 'native' ? '' : `l2-flow-provenance-${provenance}`
  const expanded = Boolean(data.expanded)
  const canToggle = Boolean(expandApi && !expandApi.readOnly)

  return (
    <div
      className={`l2-flow-node l2-flow-condition l2-flow-score ${expanded ? 'is-expanded' : ''} ${data.locked ? 'is-locked' : ''} ${provenanceClass} ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${data.paramDisabled ? 'is-param-disabled' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
    >
      {data.showPorts && (
        <>
          <Handle type="target" position={Position.Left} className="l2-flow-handle" id="in" />
          <Handle type="source" position={Position.Right} className="l2-flow-handle" id="out" />
        </>
      )}
      <div className="l2-flow-condition-head">
        {canToggle ? (
          <button
            type="button"
            className="l2-flow-condition-expand nodrag nopan"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse node' : 'Expand node'}
            onMouseDown={stopNodeGesture}
            onClick={(e) => {
              stopNodeGesture(e)
              expandApi?.toggleExpanded(data.nodeId)
            }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : null}
        <span className="l2-flow-condition-title l2-flow-score-points">{data.subtitle ?? '+1'}</span>
        <NodeLockButton nodeId={data.nodeId} locked={Boolean(data.locked)} />
      </div>
      <span className={`l2-flow-condition-name${customName ? ' has-name' : ''}`}>
        {customName ?? '\u00A0'}
      </span>
      {expanded ? (
        <div className="l2-flow-condition-body">
          <ConditionExpandBody rule={data.rule} nodeId={data.nodeId} />
        </div>
      ) : (
        <ConditionTeaserBody rule={data.rule} nodeId={data.nodeId} />
      )}
    </div>
  )
}

export const graphNodeTypes = {
  start: StartNode,
  end: EndNode,
  source: SourceNode,
  groupFrame: GroupFrameNode,
  condition: ConditionNode,
  score: ScoreNode,
}
