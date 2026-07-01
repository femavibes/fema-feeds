import { type Node, type NodeProps, Handle, Position } from '@xyflow/react'
import type { L2NodeProvenance, L2RuleNode } from '@cfb/core-types'
import { NodeExtractHandle } from './NodeExtractHandle'
import { useNodeExtractDrag } from './node-extract-context'

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
  canExtract?: boolean
  extracting?: boolean
  extractOriginParentId?: string
  nodeProvenance?: L2NodeProvenance
}

function useAltExtractPointer(nodeId: string, canExtract: boolean | undefined) {
  const onExtractDragStart = useNodeExtractDrag()
  return (e: React.PointerEvent) => {
    if (!canExtract || !onExtractDragStart || e.button !== 0) return
    if ((e.target as HTMLElement).closest('.l2-node-extract-handle')) return
    if (!e.altKey) return
    e.stopPropagation()
    e.preventDefault()
    onExtractDragStart(nodeId, e)
  }
}

export function StartNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`l2-flow-node l2-flow-start ${data.selected ? 'selected' : ''}`}>
      <Handle type="source" position={Position.Right} className="l2-flow-handle" />
      {data.label}
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
      {data.label}
    </div>
  )
}

export function GroupFrameNode({ id, data }: NodeProps<Node<GraphNodeData>>) {
  const onAltExtract = useAltExtractPointer(id, data.canExtract)
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
  return (
    <div
      className={`l2-group-frame ${logicClass} ${data.isRoot ? 'l2-group-frame-root' : ''} ${data.topLevel ? 'l2-group-frame-top' : ''} ${data.draggableFrame ? 'l2-group-frame-draggable' : ''} ${data.dropTarget ? 'l2-group-frame-drop-target' : ''} ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
      onPointerDown={onAltExtract}
    >
      <NodeExtractHandle nodeId={id} visible={Boolean(data.canExtract)} />
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
      </div>
    </div>
  )
}

export function ConditionNode({ id, data }: NodeProps<Node<GraphNodeData>>) {
  const onAltExtract = useAltExtractPointer(id, data.canExtract)
  const traceClass = data.traceOutcome ? `trace-${data.traceOutcome}` : ''
  const header = data.title ?? data.label
  const customName = data.customName?.trim()
  const provenance = data.nodeProvenance ?? 'native'
  const provenanceClass =
    provenance === 'native' ? '' : `l2-flow-provenance-${provenance}`
  return (
    <div
      className={`l2-flow-node l2-flow-condition ${provenanceClass} ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
      onPointerDown={onAltExtract}
    >
      <NodeExtractHandle nodeId={id} visible={Boolean(data.canExtract)} />
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
      {data.showPorts && (
        <>
          <Handle type="target" position={Position.Left} className="l2-flow-handle" id="in" />
          <Handle type="source" position={Position.Right} className="l2-flow-handle" id="out" />
        </>
      )}
      <span className="l2-flow-condition-title">{header}</span>
      <span className={`l2-flow-condition-name${customName ? ' has-name' : ''}`}>
        {customName ?? '\u00A0'}
      </span>
    </div>
  )
}

export function ScoreNode({ id, data }: NodeProps<Node<GraphNodeData>>) {
  const onAltExtract = useAltExtractPointer(id, data.canExtract)
  const traceClass = data.traceOutcome ? `trace-${data.traceOutcome}` : ''
  const customName = data.customName?.trim()
  return (
    <div
      className={`l2-flow-node l2-flow-score ${data.selected ? 'selected' : ''} ${data.extracting ? 'l2-node-extracting' : ''} ${traceClass}`}
      style={{ width: '100%', height: '100%' }}
      onPointerDown={onAltExtract}
    >
      <NodeExtractHandle nodeId={id} visible={Boolean(data.canExtract)} />
      {data.showPorts && (
        <>
          <Handle type="target" position={Position.Left} className="l2-flow-handle" id="in" />
          <Handle type="source" position={Position.Right} className="l2-flow-handle" id="out" />
        </>
      )}
      <span className="l2-flow-score-points">{data.subtitle ?? '+1'}</span>
      <span className={`l2-flow-condition-name${customName ? ' has-name' : ''}`}>
        {customName ?? 'Score'}
      </span>
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
