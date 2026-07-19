import { useCallback, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { LogicBlockPackage } from '@cfb/core-types'
import { normalizeRuleGroup } from '@cfb/l2-graph'

import { logicBlockToFeedDraft } from '../../lib/logic-block-editor'
import { L2GraphCanvas } from '../l2/visual/L2GraphCanvas'

/** Read-only graph for a logic-block package (shared by preview + compare). */
export function LogicBlockReadonlyCanvas({
  pkg,
  className,
  instanceId,
  selectedId,
  selectedEdgeId,
  onSelect,
  onSelectEdge,
  onNodeOpenProperties,
}: {
  pkg: LogicBlockPackage
  className?: string
  /** Unique when multiple canvases share a page (compare panes). */
  instanceId?: string
  selectedId?: string | null
  selectedEdgeId?: string | null
  onSelect?: (id: string | null) => void
  onSelectEdge?: (id: string | null) => void
  onNodeOpenProperties?: (nodeId: string) => void
}) {
  const draft = useMemo(() => logicBlockToFeedDraft(pkg), [pkg])
  const match = useMemo(() => normalizeRuleGroup(draft.match), [draft])
  const positions = draft.visualLayout?.positions ?? {}
  const canvasEdges = draft.visualLayout?.edges ?? []
  const nodeLabels = draft.visualLayout?.labels ?? {}
  const nodeSources = draft.visualLayout?.nodeSources ?? {}
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const [localSelectedEdgeId, setLocalSelectedEdgeId] = useState<string | null>(null)
  const noop = useCallback(() => {}, [])

  const selId = onSelect ? (selectedId ?? null) : localSelectedId
  const selEdge = onSelectEdge ? (selectedEdgeId ?? null) : localSelectedEdgeId
  const flowInstanceId = instanceId ?? `logic-block-${pkg.id}-v${pkg.version}`

  return (
    <div className={className}>
      <ReactFlowProvider>
        <L2GraphCanvas
          readOnly
          instanceId={flowInstanceId}
          match={match}
          positions={positions}
          canvasEdges={canvasEdges}
          selectedId={selId}
          selectedEdgeId={selEdge}
          testTrace={null}
          onSelect={onSelect ?? setLocalSelectedId}
          onSelectEdge={onSelectEdge ?? setLocalSelectedEdgeId}
          onPositionsChange={noop}
          onEdgesChange={noop}
          onMatchReorder={noop}
          nodeLabels={nodeLabels}
          nodeSources={nodeSources}
          onNodeContextMenu={noop}
          onEdgeContextMenu={noop}
          onReparent={noop}
          onExtract={noop}
          onPaletteDrop={noop}
          onNodeOpenProperties={onNodeOpenProperties}
        />
      </ReactFlowProvider>
    </div>
  )
}
