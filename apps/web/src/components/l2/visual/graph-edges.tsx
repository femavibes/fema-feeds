import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

/** Invisible hit area around each edge (keep in sync with canvasEdgesToRf). */
export const FLOW_EDGE_INTERACTION_WIDTH = 48

export function BranchFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  interactionWidth = FLOW_EDGE_INTERACTION_WIDTH,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const endpointR = Math.ceil(interactionWidth / 2)

  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={interactionWidth} />
      <circle
        cx={sourceX}
        cy={sourceY}
        r={endpointR}
        fill="transparent"
        className="react-flow__edge-interaction"
      />
      <circle
        cx={targetX}
        cy={targetY}
        r={endpointR}
        fill="transparent"
        className="react-flow__edge-interaction"
      />
    </>
  )
}
export const graphEdgeTypes = {
  branchFlow: BranchFlowEdge,
}
