import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type PoolMatchSample } from '../api/client'
import { PoolMatchSampleRow } from './l2/PoolMatchSampleRow'

interface Props {
  projectId: string
  active?: boolean
}

export function ProjectPoolPanel({ projectId, active = true }: Props) {
  const [posts, setPosts] = useState<PoolMatchSample[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedFor = useRef<string | null>(null)

  const load = useCallback(async (append = false, cursorVal?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getProjectPool(projectId, { limit: 30, cursor: cursorVal })
      setPosts((prev) => (append ? [...prev, ...res.posts] : res.posts))
      setTotal(res.total)
      setCursor(res.cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pool')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!active) return
    if (loadedFor.current === projectId) return
    loadedFor.current = projectId
    void load()
  }, [active, projectId, load])

  const refresh = () => {
    loadedFor.current = null
    void load()
  }

  return (
    <section className="l2-match-pool l2-match-pool-compact">
      <div className="l2-match-pool-toolbar">
        <span className="l2-match-pool-summary">
          <strong>{total.toLocaleString()}</strong> posts in pool
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading}
          onClick={refresh}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="field-error">{error}</p>}

      {posts.length > 0 && (
        <ul className="l2-match-pool-list">
          {posts.map((post) => (
            <PoolMatchSampleRow key={post.uri} sample={post} matched />
          ))}
        </ul>
      )}

      {!loading && posts.length === 0 && !error && (
        <p className="card-hint">No posts in this project's pool yet.</p>
      )}

      {cursor && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading}
          onClick={() => void load(true, cursor)}
        >
          Load more
        </button>
      )}
    </section>
  )
}
