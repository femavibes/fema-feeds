import type { L2ParamControlMode, L2RuleNode } from '@cfb/core-types'

/** Default for nodes without an explicit mode. */
export const DEFAULT_PARAM_CONTROL_MODE: L2ParamControlMode = 'override_when_on'

/** Resolve how Parameters interact with bound fields on this node. */
export function resolveParamControlMode(node: L2RuleNode): L2ParamControlMode {
  if (node.type === 'group' || node.type === 'parameters') return DEFAULT_PARAM_CONTROL_MODE
  const mode = (node as { paramControlMode?: L2ParamControlMode }).paramControlMode
  return mode === 'full_control' ? 'full_control' : DEFAULT_PARAM_CONTROL_MODE
}

export function isParamTargetNode(node: L2RuleNode): boolean {
  return node.type !== 'group' && node.type !== 'parameters'
}
