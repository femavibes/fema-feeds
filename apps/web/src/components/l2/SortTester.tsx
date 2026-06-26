import { useEffect, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { api, type SortTestResult } from '../../api/client'

function atUriToBskyUrl(uri: string): string {
  const m = uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/)
  if (!m) return uri
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`
}

interface Props {
  draft: FeedConfig
  testUri?: string | null
  onTestUriConsumed?: () => void
}

function fieldLabel(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SortTester({ draft, testUri, onTestUriConsumed }: Props) {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<SortTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const test = async (overrideUrl?: string) => {
    const target = overrideUrl ?? url
    if (!target.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.sortTest(draft.feedId, { url: target.trim(), feed: draft })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to test post')
    } finally {
      setLoading(false)
    }
  }

  // When testUri prop changes, auto-run
  useEffect(() => {
    if (testUri) {
      const bskyUrl = atUriToBskyUrl(testUri)
      setUrl(bskyUrl)
      void test(bskyUrl)
      onTestUriConsumed?.()
    }
  }, [testUri])

  const nonZeroFields = result?.fields ?? []

  return (
    <div className="sort-tester">
      <p className="sidebar-block-title">Sort tester</p>
      <p className="card-hint">Paste a Bluesky post URL to see how it would score with your current formula.</p>
      <div className="sort-tester-input">
        <input
          type="text"
          placeholder="https://bsky.app/profile/.../post/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void test() }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading || !url.trim()}
          onClick={() => void test()}
        >
          {loading ? 'Testing…' : 'Test'}
        </button>
      </div>

      {error ? <p className="field-error">{error}</p> : null}

      {result ? (
        <div className="sort-tester-result">
          <div className="sort-tester-score">
            <span className="sort-tester-score-label">Sort score:</span>
            <span className="sort-tester-score-value">{result.sortKey.toFixed(2)}</span>
          </div>

          <div className="sort-tester-breakdown">
            <p className="sort-tester-breakdown-title">Field values:</p>
            <table className="sort-tester-table">
              <tbody>
                {nonZeroFields.map((f) => (
                  <tr key={f.field}>
                    <td className="sort-tester-field">{fieldLabel(f.field)}</td>
                    <td className="sort-tester-value">{f.value.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nonZeroFields.length === 0 ? (
              <p className="card-hint">All field values are 0 for this post.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
