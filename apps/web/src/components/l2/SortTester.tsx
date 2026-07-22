import { useEffect, useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { api, type SortTestResult } from '../../api/client'
import { atUriToBskyUrl } from '../../lib/sort-test-display'
import { SortTestBreakdown } from './SortTestBreakdown'

interface Props {
  draft: FeedConfig
  testUri?: string | null
  onTestUriConsumed?: () => void
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

  useEffect(() => {
    if (testUri) {
      const bskyUrl = atUriToBskyUrl(testUri)
      setUrl(bskyUrl)
      void test(bskyUrl)
      onTestUriConsumed?.()
    }
  }, [testUri])

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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void test()
          }}
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
      {result ? <SortTestBreakdown result={result} feed={draft} /> : null}
    </div>
  )
}
