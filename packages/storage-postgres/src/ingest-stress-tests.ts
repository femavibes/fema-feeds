import type pg from 'pg'

export interface StressTestSavedAssociation {
  postUri: string
  projectId: string
}

export interface IngestStressTestRecord {
  id: number
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  backlog: number
  passRatePct: string
  writeSuccessPct: string
  postsPerSec: string
  savesPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
  purgedAt: string | null
  purgedPosts: number | null
  trackablePosts: number
}

export interface InsertIngestStressTestInput {
  durationSec: number
  finishedAt: string
  ignorePrefilters: boolean
  seen: number
  l1Pass: number
  saved: number
  saveErrors: number
  backlog: number
  passRatePct: string
  writeSuccessPct: string
  postsPerSec: string
  savesPerSec: string
  enabledProjects: number
  byProject: Record<string, number>
  savedAssociations?: StressTestSavedAssociation[]
  savedPostUris?: string[]
}

export interface PurgeIngestStressTestResult {
  purgedPosts: number
  purgedAssociations: number
  purgedAt: string
}

type StressRow = {
  id: string
  finished_at: Date
  duration_sec: number
  ignore_prefilters: boolean
  seen: number
  l1_pass: number
  saved: number
  save_errors: number
  backlog: number
  pass_rate_pct: string
  write_success_pct: string
  posts_per_sec: string
  saves_per_sec: string
  enabled_projects: number
  by_project: Record<string, number> | null
  purged_at: Date | null
  purged_posts: number | null
  trackable_posts: string
}

function computeWriteSuccessPct(saved: number, l1Pass: number): string {
  return l1Pass > 0 ? ((saved / l1Pass) * 100).toFixed(2) : '0.00'
}

function rowToRecord(row: StressRow): IngestStressTestRecord {
  return {
    id: Number(row.id),
    durationSec: row.duration_sec,
    finishedAt: row.finished_at.toISOString(),
    ignorePrefilters: row.ignore_prefilters,
    seen: row.seen,
    l1Pass: row.l1_pass,
    saved: row.saved,
    saveErrors: row.save_errors,
    backlog: row.backlog,
    passRatePct: row.pass_rate_pct,
    writeSuccessPct: computeWriteSuccessPct(row.saved, row.l1_pass),
    postsPerSec: row.posts_per_sec,
    savesPerSec: row.saves_per_sec,
    enabledProjects: row.enabled_projects,
    byProject: row.by_project ?? {},
    purgedAt: row.purged_at?.toISOString() ?? null,
    purgedPosts: row.purged_posts,
    trackablePosts: Number(row.trackable_posts ?? 0),
  }
}

const STRESS_TEST_SELECT = `
  SELECT t.*,
         COALESCE(p.trackable_posts, 0)::text AS trackable_posts
  FROM ingest_stress_tests t
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS trackable_posts
    FROM ingest_stress_test_saved_posts
    WHERE stress_test_id = t.id
  ) p ON true
`

async function insertStressTestAssociations(
  client: pg.PoolClient,
  stressTestId: number,
  associations: StressTestSavedAssociation[],
): Promise<void> {
  const chunkSize = 500
  for (let i = 0; i < associations.length; i += chunkSize) {
    const chunk = associations.slice(i, i + chunkSize)
    const values: string[] = []
    const params: Array<number | string> = [stressTestId]
    for (let j = 0; j < chunk.length; j++) {
      const base = j * 2 + 2
      values.push(`($1, $${base}, $${base + 1})`)
      const row = chunk[j]!
      params.push(row.postUri, row.projectId)
    }
    await client.query(
      `INSERT INTO ingest_stress_test_posts (stress_test_id, post_uri, project_id)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      params,
    )
  }
}

async function insertStressTestSavedPosts(
  client: pg.PoolClient,
  stressTestId: number,
  postUris: string[],
): Promise<void> {
  const unique = [...new Set(postUris)]
  const chunkSize = 500
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const values: string[] = []
    const params: Array<number | string> = [stressTestId]
    for (let j = 0; j < chunk.length; j++) {
      const base = j + 2
      values.push(`($1, $${base})`)
      params.push(chunk[j]!)
    }
    await client.query(
      `INSERT INTO ingest_stress_test_saved_posts (stress_test_id, post_uri)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      params,
    )
  }
}

export async function insertIngestStressTest(
  pool: pg.Pool,
  input: InsertIngestStressTestInput,
): Promise<IngestStressTestRecord> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query<StressRow>(
      `INSERT INTO ingest_stress_tests (
         finished_at, duration_sec, ignore_prefilters, seen, l1_pass, saved,
         save_errors, backlog, pass_rate_pct, write_success_pct, posts_per_sec, saves_per_sec,
         enabled_projects, by_project
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING *, 0::text AS trackable_posts`,
      [
        input.finishedAt,
        input.durationSec,
        input.ignorePrefilters,
        input.seen,
        input.l1Pass,
        input.saved,
        input.saveErrors,
        input.backlog,
        input.passRatePct,
        input.writeSuccessPct,
        input.postsPerSec,
        input.savesPerSec,
        input.enabledProjects,
        JSON.stringify(input.byProject),
      ],
    )
    const row = res.rows[0]
    if (!row) throw new Error('Failed to insert ingest stress test')
    const stressTestId = Number(row.id)
    if (input.savedPostUris && input.savedPostUris.length > 0) {
      await insertStressTestSavedPosts(client, stressTestId, input.savedPostUris)
    }
    if (input.savedAssociations && input.savedAssociations.length > 0) {
      await insertStressTestAssociations(client, stressTestId, input.savedAssociations)
    }
    await client.query('COMMIT')
    const loaded = await pool.query<StressRow>(
      `${STRESS_TEST_SELECT} WHERE t.id = $1`,
      [stressTestId],
    )
    const saved = loaded.rows[0]
    if (!saved) throw new Error('Failed to load ingest stress test')
    return rowToRecord(saved)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getIngestStressTest(
  pool: pg.Pool,
  id: number,
): Promise<IngestStressTestRecord | null> {
  const res = await pool.query<StressRow>(`${STRESS_TEST_SELECT} WHERE t.id = $1`, [id])
  const row = res.rows[0]
  return row ? rowToRecord(row) : null
}

export async function getLatestIngestStressTest(
  pool: pg.Pool,
): Promise<IngestStressTestRecord | null> {
  const res = await pool.query<StressRow>(
    `${STRESS_TEST_SELECT}
     ORDER BY t.finished_at DESC, t.id DESC
     LIMIT 1`,
  )
  const row = res.rows[0]
  return row ? rowToRecord(row) : null
}

export async function listIngestStressTests(
  pool: pg.Pool,
  limit = 10,
): Promise<IngestStressTestRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 50)
  const res = await pool.query<StressRow>(
    `${STRESS_TEST_SELECT}
     ORDER BY t.finished_at DESC, t.id DESC
     LIMIT $1`,
    [capped],
  )
  return res.rows.map(rowToRecord)
}

export async function purgeIngestStressTest(
  pool: pg.Pool,
  id: number,
): Promise<PurgeIngestStressTestResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const testRes = await client.query<{
      purged_at: Date | null
      ignore_prefilters: boolean
      by_project: Record<string, number> | null
    }>(
      `SELECT purged_at, ignore_prefilters, by_project
       FROM ingest_stress_tests WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const test = testRes.rows[0]
    if (!test) throw new Error('Stress test run not found')
    if (test.purged_at) throw new Error('Posts from this run were already purged')

    const trackRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ingest_stress_test_saved_posts WHERE stress_test_id = $1`,
      [id],
    )
    const trackable = Number(trackRes.rows[0]?.count ?? 0)
    if (trackable === 0) {
      throw new Error(
        'This run has no tracked posts to purge (re-run after upgrading, or no successful writes)',
      )
    }

    let purgedAssociations = 0
    if (test.ignore_prefilters) {
      const projectIds = Object.keys(test.by_project ?? {})
      if (projectIds.length > 0) {
        const assocRes = await client.query(
          `DELETE FROM ingested_post_projects ipp
           USING ingest_stress_test_saved_posts sp
           WHERE sp.stress_test_id = $1
             AND ipp.post_uri = sp.post_uri
             AND ipp.project_id = ANY($2::text[])`,
          [id, projectIds],
        )
        purgedAssociations = assocRes.rowCount ?? 0
      }
    } else {
      const assocRes = await client.query(
        `DELETE FROM ingested_post_projects ipp
         USING ingest_stress_test_posts stp
         WHERE stp.stress_test_id = $1
           AND ipp.post_uri = stp.post_uri
           AND ipp.project_id = stp.project_id`,
        [id],
      )
      purgedAssociations = assocRes.rowCount ?? 0
    }

    const postsRes = await client.query(
      `DELETE FROM ingested_posts ip
       WHERE ip.post_uri IN (
         SELECT post_uri FROM ingest_stress_test_saved_posts WHERE stress_test_id = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM ingested_post_projects ipp WHERE ipp.post_uri = ip.post_uri
       )`,
      [id],
    )
    const purgedPosts = postsRes.rowCount ?? 0
    const purgedAt = new Date()

    await client.query(
      `UPDATE ingest_stress_tests
       SET purged_at = $2, purged_posts = $3
       WHERE id = $1`,
      [id, purgedAt, purgedPosts],
    )
    await client.query('COMMIT')

    return {
      purgedPosts,
      purgedAssociations,
      purgedAt: purgedAt.toISOString(),
    }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
