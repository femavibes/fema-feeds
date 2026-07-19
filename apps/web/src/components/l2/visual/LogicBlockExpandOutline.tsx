import { useEffect, useRef, useState } from 'react'
import type { L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import {
  conditionCollapseMetrics,
  conditionNodeTitle,
  estimateLogicBlockPreviewBodyHeight,
  groupNodeTitle,
  normalizeRuleGroup,
  setLogicBlockPreviewBodyHeight,
} from '@cfb/l2-graph'

import { api } from '../../../api/client'
import { ingestRoleBadgeFor } from '../../../lib/l2-ingest-badge'
import { NodeRoleIcon } from '../NodeRoleIcon'
import { useNodeExpand } from './node-expand-context'

function groupLogicClass(logic: L2RuleGroup['logic']): string {
  switch (logic) {
    case 'all':
      return 'logic-all'
    case 'any':
      return 'logic-any'
    case 'n_of':
      return 'logic-nof'
    case 'none':
      return 'logic-none'
    default:
      return 'logic-any'
  }
}

/** Mini replicas of canvas group frames + condition chips. */
function MiniLogicTree({ node }: { node: L2RuleNode }) {
  if (node.type === 'group') {
    const children = node.children ?? []
    return (
      <div className={`l2-group-frame ${groupLogicClass(node.logic)} l2-logic-block-mini-frame`}>
        <div className="l2-group-frame-header">
          <span className="l2-group-frame-logic">
            {groupNodeTitle(node.logic, node.minPass)}
          </span>
        </div>
        <div className="l2-logic-block-mini-children">
          {children.length === 0 ? (
            <p className="l2-logic-block-outline-status">Empty group</p>
          ) : (
            children.map((child) => <MiniLogicTree key={child.id} node={child} />)
          )}
        </div>
      </div>
    )
  }

  const title = conditionNodeTitle(node)
  const teaser = conditionCollapseMetrics(node).textLines.slice(0, 3)
  const roles = ingestRoleBadgeFor(node)

  return (
    <div className="l2-flow-condition l2-logic-block-mini-condition">
      <div className="l2-flow-condition-head">
        <span className="l2-flow-condition-title">{title}</span>
        {roles.map((role) => (
          <NodeRoleIcon key={role} role={role} />
        ))}
      </div>
      {teaser.length > 0 ? (
        <div className="l2-flow-condition-teaser">
          <ul className="l2-flow-condition-body-list">
            {teaser.map((line) => (
              <li key={line} className="l2-flow-condition-body-line" title={line}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Full-size mini canvas chrome for a logic block’s packaged match (no inner scroll). */
export function LogicBlockExpandOutline({
  packageId,
  versionPin,
}: {
  packageId: string
  versionPin: string
}) {
  const expandApi = useNodeExpand()
  const refreshLayoutRef = useRef(expandApi?.requestLayoutRefresh)
  refreshLayoutRef.current = expandApi?.requestLayoutRefresh
  const [root, setRoot] = useState<L2RuleGroup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setRoot(null)
    void api
      .getLogicBlock(packageId, versionPin)
      .then((res) => {
        if (cancelled) return
        const match = normalizeRuleGroup(structuredClone(res.package.root))
        setRoot(match)
        setLogicBlockPreviewBodyHeight(
          packageId,
          versionPin,
          estimateLogicBlockPreviewBodyHeight(match),
        )
        refreshLayoutRef.current?.()
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load logic block')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [packageId, versionPin])

  return (
    <div
      className="l2-logic-block-outline nodrag nopan nowheel"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {loading ? (
        <p className="l2-logic-block-outline-status">Loading logic…</p>
      ) : error ? (
        <p className="l2-logic-block-outline-status is-error">{error}</p>
      ) : !root ? (
        <p className="l2-logic-block-outline-status">Empty logic block</p>
      ) : (
        <div className="l2-logic-block-mini-tree">
          <MiniLogicTree node={root} />
        </div>
      )}
    </div>
  )
}
