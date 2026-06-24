import { useEffect, useState } from 'react'
import type { FeedConfig, L2NodeTrace, PostMetrics } from '@cfb/core-types'
import { api, type L2PreviewResult } from '../../api/client'
import { L2TraceList, formatTraceHighlight } from './L2TraceList'
import { normalizePostUrlField } from '../../lib/post-url'
import type { TraceSelectHandler } from './visual/L2PreviewRail'
function formatMetricsNote(metrics?: PostMetrics, source?: L2PreviewResult['metricsSource']): string | null {
  if (!metrics) return null
  const parts = [
    `${metrics.likeCount ?? 0} likes`,
    `${metrics.repostCount ?? 0} reposts`,
  ]
  if (metrics.replyCount) parts.push(`${metrics.replyCount} replies`)
  if (metrics.authorFollowerCount) parts.push(`${metrics.authorFollowerCount} followers`)
  const label =
    source === 'pool'
      ? 'from pool'
      : source === 'default'
        ? 'no pool — counts treated as 0'
        : 'override'
  return `Engagement used: ${parts.join(', ')} (${label})`
}

interface Props {
  draft: FeedConfig
  /** Inspector rail: tighter layout, no card chrome. */
  compact?: boolean
  onTestTrace?: (trace: L2NodeTrace[] | null) => void
  onSelectNode?: TraceSelectHandler
}

export function L2PreviewPanel({ draft, compact = false, onTestTrace, onSelectNode }: Props) {
  const [postInput, setPostInput] = useState('')
  const [result, setResult] = useState<L2PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    onTestTrace?.(result?.result.trace ?? null)
  }, [result, onTestTrace])

  const run = async () => {
    if (!postInput.trim()) {
      setError('Paste a Bluesky post URL or at:// URI')
      return
    }
    setLoading(true)
    setError(null)
    onTestTrace?.(null)
    try {
      let post = postInput.trim()
      try {
        const normalized = normalizePostUrlField(postInput)
        post = normalized.value
        if (normalized.extracted) setPostInput(normalized.value)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid post link')
        onTestTrace?.(null)
        return
      }
      const res = await api.previewFeed(draft.feedId, {
        post,
        feed: draft,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed')
      setResult(null)
      onTestTrace?.(null)
    } finally {
      setLoading(false)
    }
  }

  const metricsNote = result ? formatMetricsNote(result.metrics, result.metricsSource) : null

  return (
    <section className={`l2-preview${compact ? ' l2-preview-compact' : ' card'}`}>
      <h3>{compact ? 'Try one post' : 'Test on a post'}</h3>
      <p className="card-hint l2-preview-hint">
        Paste a bsky.app post link (not /api/…). Works on draft rules before Update live.
        Pass/fail highlights appear on the graph.
      </p>
      <div className="field-stack">
        <label>
          Post URL or at:// URI
          <input
            value={postInput}
            onChange={(e) => setPostInput(e.target.value)}
            placeholder="https://bsky.app/..."
          />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void run()}>
          {loading ? 'Testing…' : 'Run test'}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
      {result && (
        <>
          <p className={result.result.matched ? 'dry-run-headline' : 'field-error'}>
            {result.result.matched ? '✓ Would be a feed candidate' : '✗ Would not be a candidate'}
            {result.result.sortKey != null && ` · sort key ${result.result.sortKey}`}
          </p>
          {formatTraceHighlight(result.result.trace, result.result.matched) ? (
            <p className="l2-preview-why">
              {result.result.matched ? 'Matched because: ' : 'Rejected at: '}
              <strong>{formatTraceHighlight(result.result.trace, result.result.matched)}</strong>
            </p>
          ) : null}
          {metricsNote ? <p className="card-hint l2-preview-metrics">{metricsNote}</p> : null}
          {onSelectNode ? (
            <p className="card-hint l2-preview-hint">Click a step below to select that node on the canvas.</p>
          ) : null}
          <L2TraceList
            trace={result.result.trace}
            onSelectNode={
              onSelectNode
                ? (nodeId) => onSelectNode(nodeId, result.result.trace)
                : undefined
            }
          />
        </>
      )}
    </section>
  )
}
