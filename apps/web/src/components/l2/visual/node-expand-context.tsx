import { createContext, useContext, type ReactNode } from 'react'

export type NodeExpandApi = {
  toggleExpanded: (nodeId: string) => void
  collapseAllInGroup: (groupId: string) => void
  expandAllInGroup: (groupId: string) => void
  toggleLocked: (nodeId: string) => void
  /** Open the properties panel for a node (e.g. expanded “+N more”). */
  openProperties?: (nodeId: string) => void
  readOnly?: boolean
}

const NodeExpandContext = createContext<NodeExpandApi | null>(null)

export function NodeExpandProvider({
  value,
  children,
}: {
  value: NodeExpandApi
  children: ReactNode
}) {
  return <NodeExpandContext.Provider value={value}>{children}</NodeExpandContext.Provider>
}

export function useNodeExpand(): NodeExpandApi | null {
  return useContext(NodeExpandContext)
}
