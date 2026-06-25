import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeedConfig, L2RuleGroup } from '@cfb/core-types'
import { api, type PoolMatchResult } from '../../api/client'
import { normalizePoolMatchResult } from '../../lib/pool-match-sample'
import { PoolMatchSampleRow } from './PoolMatchSampleRow'
import type { TraceSelectHandler } from './visual/L2PreviewRail'

interface Props {
  draft: FeedConfig
  match: L2RuleGroup
  /** When false, skip auto-fetch (tab not visible). */
  active?: boolean
  compact?: boolean
  /** Sidebar feed tab uses "Feed" labels; visual inspector uses "Matches". */
  variant?: 'matches' | 'feed'
  onSelectNode?: TraceSelectHandler
}

const SCAN_PRESETS = [200, 500, 1000, 2000]

function rejectedCount(result: PoolMatchResult): number {
  if (typeof result.rejectCount === 'number') return result.rejectCount
  return Math.max(0, result.scanned - result.matchCount)
}

export function L2MatchPoolPanel({
  draft,
  match,
  active = true,
  compact = false,
  variant = 'matches',
  onSelectNode,
}: Props) {
  const [result, setResult] = useState<PoolMatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanLimit, setScanLimit] = useState(500)
  const [matchLimit, setMatchLimit] = useState(compact ? 20 : 30)
  const [rejectLimit, setRejectLimit] = useState(6)
  const runSeq = useRef(0)
  const scannedForKey = useRef<string | null>(null)
  const matchKey = useMemo(() => JSON.stringify(match), [match])

  const feedForScan = useMemo(
    (): FeedConfig => ({ ...draft, match }),
    [draft, match],
  )
  const feedRef = useRef(feedForScan)
  feedRef.current = feedForScan

  const run = useCallback(async () => {
    const seq = ++runSeq.current
    const current = feedRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await api.matchFeedPool(current.feedId, {
        feed: current,
        limit: matchLimit,
        scanLimit,
        rejectLimit,
      })
      if (seq !== runSeq.current) return
      setResult(normalizePoolMatchResult(res))
    } catch (e) {
      if (seq !== runSeq.current) return
      setError(e instanceof Error ? e.message : 'Pool scan failed')
      setResult(null)
    } finally {
      if (seq === runSeq.current) setLoading(false)
    }
  }, [matchLimit, rejectLimit, scanLimit])

  useEffect(() => {
    if (!active) return
    if (scannedForKey.current === matchKey) return
    scannedForKey.current = matchKey
    void run()
  }, [active, matchKey, run])

  const isFeed = variant === 'feed'
  const refreshLabel = loading ? 'Scanning…' : isFeed ? 'Refresh' : 'Scan pool'
  const postsSectionTitle = isFeed ? 'Feed' : 'Matches'
  const rejected = result ? rejectedCount(result) : 0

  return (
    <section className={`l2-match-pool ${compact ? 'l2-match-pool-compact' : 'card'}`}>
      {!compact && <h3>{isFeed ? 'Feed preview' : 'Matching pool posts'}</h3>}

      <div className="l2-match-pool-toolbar">
        <div className="dry-run-presets l2-match-pool-scan-presets" role="group" aria-label="Scan depth">
          {SCAN_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              className={`btn btn-ghost btn-sm${scanLimit === n ? ' active' : ''}`}
              disabled={loading}
              onClick={() => setScanLimit(n)}
            >
              {n >= 1000 ? `${n / 1000}k` : n}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading}
          onClick={() => void run()}
        >
          {refreshLabel}
        </button>
      </div>

      <details className="l2-match-pool-advanced">
        <summary>Scan options</summary>
        <div className="l2-match-pool-controls">
          <label className="l2-match-pool-control">
            Posts to scan
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={scanLimit}
              disabled={loading}
              onChange={(e) => setScanLimit(Number.parseInt(e.target.value, 10) || 500)}
            />
          </label>
          <label className="l2-match-pool-control">
            Matches to list
            <input
              type="number"
              min={1}
              max={100}
              value={matchLimit}
              disabled={loading}
              onChange={(e) => setMatchLimit(Number.parseInt(e.target.value, 10) || 20)}
            />
          </label>
          <label className="l2-match-pool-control">
            Rejected to list
            <input
              type="number"
              min={0}
              max={50}
              value={rejectLimit}
              disabled={loading}
              onChange={(e) => setRejectLimit(Number.parseInt(e.target.value, 10) || 0)}
            />
          </label>
        </div>
        <p className="card-hint">
          Rejected posts appear below matches under <strong>Rejected samples</strong>, each with an
          expandable rule trace.
        </p>
      </details>

      {error && <p className="field-error">{error}</p>}
      {result && (
        <div className={loading ? 'l2-match-pool-updating' : undefined}>
          <p className="l2-match-pool-summary">
            <strong>{result.matchCount}</strong> matched · <strong>{rejected}</strong> rejected ·{' '}
            <strong>{result.scanned}</strong> scanned
            {result.poolTotal > result.scanned && (
              <>
                {' '}
                · pool <strong>{result.poolTotal}</strong>
              </>
            )}
            {result.truncated && ` · stopped at ${scanLimit.toLocaleString()} scan cap`}
          </p>

          {result.posts.length > 0 ? (
            <>
              <h4 className="l2-match-pool-section-title">{postsSectionTitle}</h4>
              <ul className="l2-match-pool-list">
                {result.posts.map((post) => (
                  <PoolMatchSampleRow
                    key={post.uri}
                    sample={post}
                    matched
                    sortKey={post.sortKey}
                    editorScore={post.editorScore}
                    onSelectNode={onSelectNode}
                  />
                ))}
              </ul>
              {result.matchCount > result.posts.length && (
                <p className="card-hint">
                  Showing {result.posts.length} of {result.matchCount} matches — raise{' '}
                  <em>Matches to list</em> in scan options.
                </p>
              )}
            </>
          ) : (
            <p className="card-hint">No matches in this scan.</p>
          )}

          {result.rejects.length > 0 ? (
            <>
              <h4 className="l2-match-pool-section-title">Rejected samples</h4>
              <p className="card-hint">
                {result.rejects.length} of {rejected} rejected posts — expand a card for the rule
                trace.
              </p>
              <ul className="l2-match-pool-list l2-match-pool-list-rejects">
                {result.rejects.map((post) => (
                  <PoolMatchSampleRow
                    key={`reject-${post.uri}`}
                    sample={post}
                    onSelectNode={onSelectNode}
                  />
                ))}
              </ul>
            </>
          ) : rejected > 0 ? (
            <p className="card-hint">
              {rejected} posts were rejected but none are listed — raise{' '}
              <em>Rejected to list</em> in scan options, then scan again.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
