import { useNodeExtractDrag } from './node-extract-context'

export function NodeExtractHandle({ nodeId, visible }: { nodeId: string; visible: boolean }) {
  const onExtractDragStart = useNodeExtractDrag()
  if (!visible || !onExtractDragStart) return null

  return (
    <button
      type="button"
      className="l2-node-extract-handle nodrag nopan"
      aria-label="Drag out of group"
      title="Drag out of group (Alt+drag on node also works)"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()
        onExtractDragStart(nodeId, e)
      }}
    />
  )
}
