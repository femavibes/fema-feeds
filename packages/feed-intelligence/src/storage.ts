import type { Pool } from 'pg'
import type { SignalType, PoolSignalRow, FirehoseBaselineRow } from './types.js'
import type { CounterSnapshot } from './counters.js'

export async function ensureIntelligenceTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pool_signals (
      project_id TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      value TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      window_start TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (project_id, signal_type, value, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_pool_signals_project_window
      ON pool_signals (project_id, window_start);

    CREATE TABLE IF NOT EXISTS firehose_baseline (
      signal_type TEXT NOT NULL,
      value TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      sample_size INTEGER NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (signal_type, value, window_start)
    );

    CREATE TABLE IF NOT EXISTS intelligence_dismissed (
      project_id TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      value TEXT NOT NULL,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, signal_type, value)
    );
  `)
}

/** Get the start of today (UTC) for windowing. */
function todayWindow(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** Flush pool counter snapshot to DB (upsert counts for today's window — additive). */
export async function flushPoolSignals(
  pool: Pool,
  projectId: string,
  snapshot: CounterSnapshot,
): Promise<void> {
  if (snapshot.entries.length === 0) return
  const windowStart = todayWindow()

  // Batch upsert in chunks of 500
  const chunkSize = 500
  for (let i = 0; i < snapshot.entries.length; i += chunkSize) {
    const chunk = snapshot.entries.slice(i, i + chunkSize)
    const values: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const entry of chunk) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`)
      params.push(projectId, entry.type, entry.value, entry.count, windowStart)
      idx += 5
    }

    await pool.query(
      `INSERT INTO pool_signals (project_id, signal_type, value, count, window_start)
       VALUES ${values.join(', ')}
       ON CONFLICT (project_id, signal_type, value, window_start)
       DO UPDATE SET count = pool_signals.count + EXCLUDED.count`,
      params,
    )
  }
}

/** Replace pool signals for a project (idempotent — deletes existing for today's window, then inserts). */
export async function replacePoolSignals(
  pool: Pool,
  projectId: string,
  snapshot: CounterSnapshot,
): Promise<void> {
  if (snapshot.entries.length === 0) return
  const windowStart = todayWindow()

  // Delete existing signals for this project/window
  await pool.query(
    `DELETE FROM pool_signals WHERE project_id = $1 AND window_start = $2`,
    [projectId, windowStart],
  )

  // Insert fresh
  const chunkSize = 500
  for (let i = 0; i < snapshot.entries.length; i += chunkSize) {
    const chunk = snapshot.entries.slice(i, i + chunkSize)
    const values: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const entry of chunk) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`)
      params.push(projectId, entry.type, entry.value, entry.count, windowStart)
      idx += 5
    }

    await pool.query(
      `INSERT INTO pool_signals (project_id, signal_type, value, count, window_start)
       VALUES ${values.join(', ')}`,
      params,
    )
  }
}

/** Flush firehose baseline snapshot to DB (top-K only, additive). */
export async function flushFirehoseBaseline(
  pool: Pool,
  snapshot: CounterSnapshot,
  topK: number = 10000,
): Promise<void> {
  if (snapshot.entries.length === 0) return
  const windowStart = todayWindow()
  const entries = snapshot.entries
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)

  const chunkSize = 500
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const values: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const entry of chunk) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`)
      params.push(entry.type, entry.value, entry.count, snapshot.totalPosts, windowStart)
      idx += 5
    }

    await pool.query(
      `INSERT INTO firehose_baseline (signal_type, value, count, sample_size, window_start)
       VALUES ${values.join(', ')}
       ON CONFLICT (signal_type, value, window_start)
       DO UPDATE SET count = firehose_baseline.count + EXCLUDED.count,
                     sample_size = firehose_baseline.sample_size + EXCLUDED.sample_size`,
      params,
    )
  }
}

/** Replace firehose baseline (idempotent — deletes existing for today's window, then inserts). */
export async function replaceFirehoseBaseline(
  pool: Pool,
  snapshot: CounterSnapshot,
  topK: number = 10000,
): Promise<void> {
  if (snapshot.entries.length === 0) return
  const windowStart = todayWindow()
  const entries = snapshot.entries
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)

  // Delete existing baseline for today's window
  await pool.query(
    `DELETE FROM firehose_baseline WHERE window_start = $1`,
    [windowStart],
  )

  const chunkSize = 500
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const values: string[] = []
    const params: unknown[] = []
    let idx = 1

    for (const entry of chunk) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`)
      params.push(entry.type, entry.value, entry.count, snapshot.totalPosts, windowStart)
      idx += 5
    }

    await pool.query(
      `INSERT INTO firehose_baseline (signal_type, value, count, sample_size, window_start)
       VALUES ${values.join(', ')}`,
      params,
    )
  }
}

/** Load pool signals for a project within the rolling window. */
export async function loadPoolSignals(
  pool: Pool,
  projectId: string,
  windowDays: number,
): Promise<PoolSignalRow[]> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
  const { rows } = await pool.query(
    `SELECT signal_type, value, SUM(count)::int as count, MIN(window_start) as window_start
     FROM pool_signals
     WHERE project_id = $1 AND window_start >= $2
     GROUP BY signal_type, value`,
    [projectId, cutoff],
  )
  return rows.map((r: any) => ({
    projectId,
    signalType: r.signal_type as SignalType,
    value: r.value,
    count: r.count,
    windowStart: r.window_start,
  }))
}

/** Load firehose baseline within the rolling window. */
export async function loadFirehoseBaseline(
  pool: Pool,
  windowDays: number,
): Promise<{ signals: FirehoseBaselineRow[]; totalSampled: number }> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
  const { rows: sizeRows } = await pool.query(
    `SELECT COALESCE(SUM(sample_size), 0)::int as total FROM firehose_baseline WHERE window_start >= $1`,
    [cutoff],
  )
  const totalSampled = sizeRows[0]?.total ?? 0

  const { rows } = await pool.query(
    `SELECT signal_type, value, SUM(count)::int as count, SUM(sample_size)::int as sample_size, MIN(window_start) as window_start
     FROM firehose_baseline
     WHERE window_start >= $1
     GROUP BY signal_type, value`,
    [cutoff],
  )
  return {
    signals: rows.map((r: any) => ({
      signalType: r.signal_type as SignalType,
      value: r.value,
      count: r.count,
      sampleSize: r.sample_size,
      windowStart: r.window_start,
    })),
    totalSampled,
  }
}

/** Prune signals older than windowDays. */
export async function pruneOldSignals(pool: Pool, windowDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
  await pool.query(`DELETE FROM pool_signals WHERE window_start < $1`, [cutoff])
  await pool.query(`DELETE FROM firehose_baseline WHERE window_start < $1`, [cutoff])
}

/** Get dismissed suggestions for a project. */
export async function getDismissedSignals(
  pool: Pool,
  projectId: string,
): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT signal_type, value FROM intelligence_dismissed WHERE project_id = $1`,
    [projectId],
  )
  return new Set(rows.map((r: any) => `${r.signal_type}\x00${r.value}`))
}

/** Get actual post count for a pool scope (project or feed). */
export async function getPoolPostCount(
  pool: Pool,
  projectId: string,
): Promise<number> {
  // feed:feedId → count from feed_candidates
  if (projectId.startsWith('feed:')) {
    const feedId = projectId.slice(5)
    const { rows } = await pool.query(
      `SELECT count(*)::int as cnt FROM feed_candidates WHERE feed_id = $1`,
      [feedId],
    )
    return rows[0]?.cnt ?? 0
  }
  // project → count from ingested_post_projects
  const { rows } = await pool.query(
    `SELECT count(*)::int as cnt FROM ingested_post_projects WHERE project_id = $1`,
    [projectId],
  )
  return rows[0]?.cnt ?? 0
}

/** Dismiss a suggestion. */
export async function dismissSignal(
  pool: Pool,
  projectId: string,
  signalType: SignalType,
  value: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO intelligence_dismissed (project_id, signal_type, value)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [projectId, signalType, value],
  )
}

/** Undismiss a suggestion. */
export async function undismissSignal(
  pool: Pool,
  projectId: string,
  signalType: SignalType,
  value: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM intelligence_dismissed WHERE project_id = $1 AND signal_type = $2 AND value = $3`,
    [projectId, signalType, value],
  )
}

/** Load intelligence settings from DB. Returns null if not set. */
export async function getIntelligenceSettings(
  pool: Pool,
): Promise<import('./types.js').IntelligenceConfig | null> {
  const { rows } = await pool.query(
    `SELECT value FROM cfb_settings WHERE key = 'intelligence_config'`,
  )
  if (!rows[0]) return null
  try {
    return JSON.parse(rows[0].value)
  } catch {
    return null
  }
}

/** Save intelligence settings to DB. */
export async function saveIntelligenceSettings(
  pool: Pool,
  config: import('./types.js').IntelligenceConfig,
): Promise<void> {
  await pool.query(
    `INSERT INTO cfb_settings (key, value) VALUES ('intelligence_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(config)],
  )
}

/** Get per-project intelligence enabled/disabled state. */
export async function getProjectIntelligenceDisabled(
  pool: Pool,
): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT value FROM cfb_settings WHERE key = 'intelligence_disabled_projects'`,
  )
  if (!rows[0]) return new Set()
  try {
    return new Set(JSON.parse(rows[0].value))
  } catch {
    return new Set()
  }
}

/** Save per-project intelligence disabled list. */
export async function saveProjectIntelligenceDisabled(
  pool: Pool,
  projectIds: string[],
): Promise<void> {
  await pool.query(
    `INSERT INTO cfb_settings (key, value) VALUES ('intelligence_disabled_projects', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(projectIds)],
  )
}
