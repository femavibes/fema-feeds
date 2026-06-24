import { createContext, useContext } from 'react'

type ExtractDragStart = (nodeId: string, event: { clientX: number; clientY: number }) => void

export const NodeExtractContext = createContext<ExtractDragStart | null>(null)

export function useNodeExtractDrag(): ExtractDragStart | null {
  return useContext(NodeExtractContext)
}
