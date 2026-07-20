/** Measured body heights for Properties-style expanded canvas nodes. */
const expandBodyHeightByNodeId = new Map<string, number>()

export function setConditionExpandBodyHeight(nodeId: string, bodyHeight: number): void {
  expandBodyHeightByNodeId.set(nodeId, Math.max(48, Math.ceil(bodyHeight)))
}

export function getConditionExpandBodyHeight(nodeId: string): number | undefined {
  return expandBodyHeightByNodeId.get(nodeId)
}

export function clearConditionExpandBodyHeight(nodeId: string): void {
  expandBodyHeightByNodeId.delete(nodeId)
}

/** Placeholder until ResizeObserver reports the ConditionRow body size. */
export const PROPERTIES_EXPAND_LOADING_BODY_H = 220

/** Wider canvas card when showing the Properties form. */
export const PROPERTIES_EXPAND_W = 400

/** Extra px added under measured body so padding/search chrome isn’t clipped. */
export const PROPERTIES_EXPAND_BODY_PAD = 36
