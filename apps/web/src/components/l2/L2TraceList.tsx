import type { L2NodeTrace } from '@cfb/core-types'

export function firstTraceFailure(trace: L2NodeTrace[]): L2NodeTrace | undefined {
  return trace.find((t) => t.outcome === 'fail')
}

export function formatTraceFailure(trace: L2NodeTrace[]): string | null {
  const fail = firstTraceFailure(trace)
  if (!fail) return null
  const label = fail.detail?.trim() || fail.nodeType
  return `${fail.nodeType}: ${label}`
}

export function formatTraceHighlight(trace: L2NodeTrace[], matched: boolean): string | null {
  if (!matched) return formatTraceFailure(trace)
  const author = [...trace].reverse().find((t) => t.nodeType === 'author' && t.outcome === 'pass')
  if (author?.detail?.trim()) return author.detail.trim()
  const group = [...trace].reverse().find((t) => t.nodeType === 'group' && t.outcome === 'pass')
  if (group?.detail?.trim()) return group.detail.trim()
  return 'all rules passed'
}

interface Props {
  trace: L2NodeTrace[]
  onSelectNode?: (nodeId: string) => void
  compact?: boolean
}

export function L2TraceList({ trace, onSelectNode, compact = false }: Props) {
  if (trace.length === 0) return null
  return (
    <ul className={`l2-trace-list${compact ? ' l2-trace-list-compact' : ''}`}>
      {trace.map((t) => (
        <li key={t.nodeId}>
          {onSelectNode ? (
            <button
              type="button"
              className={`l2-trace-item l2-trace-${t.outcome} l2-trace-item-btn`}
              onClick={() => onSelectNode(t.nodeId)}
            >
              <span className="l2-trace-type">{t.nodeType}</span>
              <span className="l2-trace-outcome">{t.outcome}</span>
              {t.detail ? <span className="l2-trace-detail">{t.detail}</span> : null}
            </button>
          ) : (
            <div className={`l2-trace-item l2-trace-${t.outcome}`}>
              <span className="l2-trace-type">{t.nodeType}</span>
              <span className="l2-trace-outcome">{t.outcome}</span>
              {t.detail ? <span className="l2-trace-detail">{t.detail}</span> : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
