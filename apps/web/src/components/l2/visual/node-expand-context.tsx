import { createContext, useContext, type ReactNode } from 'react'
import type { L2ParamValue, L2RuleGroup, L2RuleNode } from '@cfb/core-types'

export type NodeExpandApi = {
  toggleExpanded: (nodeId: string) => void
  collapseAllInGroup: (groupId: string) => void
  expandAllInGroup: (groupId: string) => void
  toggleLocked: (nodeId: string) => void
  /** Open the properties panel for a node (e.g. expanded “+N more”). */
  openProperties?: (nodeId: string) => void
  /** Open Parameter control mode for a Param-driven target node. */
  openParamControlMode?: (nodeId: string) => void
  /** Re-measure node heights after async expand content loads (logic blocks). */
  requestLayoutRefresh?: () => void
  /** Patch a Parameter Node’s live values from the canvas controls. */
  patchParameterValues?: (
    nodeId: string,
    values: Record<string, L2ParamValue>,
  ) => void
  /** Patch any condition node from the Properties-style expand form. */
  patchRuleNode?: (nodeId: string, next: L2RuleNode) => void
  /** Current authored match — used to preview Parameter bind effects on canvas. */
  match?: L2RuleGroup
  /** Live feed Param values (triggers / API write here). */
  liveParamValues?: Record<string, L2ParamValue>
  /** Overrides for applyParametersToMatch (draft + live merged). */
  paramPreviewOverrides?: Record<string, L2ParamValue>
  productionParams?: ReadonlySet<string>
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
