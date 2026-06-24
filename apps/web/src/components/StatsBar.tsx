import type { IngestStats } from '../api/client'

interface Props {
  stats: IngestStats | null
  onRefresh: () => void
}

export function StatsBar({ stats, onRefresh }: Props) {
  return (
    <div className="stats-bar">
      {stats ? (
        <>
          <span className="stat">
            <strong>{stats.poolSize}</strong> in pool
          </span>
          <span className="stat">
            <strong>{stats.listCacheCount}</strong> lists cached
          </span>
        </>
      ) : (
        <span className="stat stat-muted">Stats unavailable (API needs DATABASE_URL)</span>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>
        Refresh
      </button>
    </div>
  )
}
