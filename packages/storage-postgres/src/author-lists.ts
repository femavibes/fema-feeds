import type pg from 'pg'

export interface AuthorListCacheRow {
  listId: string
  projectId: string
  sourceJson: unknown
  dids: string[]
  memberCount: number
  graphName: string | null
  refreshedAt: Date | null
  nextPollAt: Date | null
  remotePollKey: string | null
}

export interface UpsertAuthorListCacheInput {
  listId: string
  projectId: string
  sourceJson: unknown
  dids: string[]
  memberCount: number
  graphName?: string | null
  refreshedAt?: Date | null
  nextPollAt?: Date | null
  remotePollKey?: string | null
}

const SELECT_COLS = `list_id, project_id, source_json, dids, member_count, graph_name, refreshed_at, next_poll_at, remote_poll_key`

function rowFromDb(r: pg.QueryResultRow): AuthorListCacheRow {
  return {
    listId: r.list_id as string,
    projectId: r.project_id as string,
    sourceJson: r.source_json,
    dids: r.dids as string[],
    memberCount: Number(r.member_count),
    graphName: (r.graph_name as string | null) ?? null,
    refreshedAt: r.refreshed_at ? new Date(r.refreshed_at as string) : null,
    nextPollAt: r.next_poll_at ? new Date(r.next_poll_at as string) : null,
    remotePollKey: (r.remote_poll_key as string | null) ?? null,
  }
}

export async function upsertAuthorListCache(
  pool: pg.Pool,
  input: UpsertAuthorListCacheInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO author_list_cache (
       list_id, project_id, source_json, dids, member_count, graph_name, refreshed_at, next_poll_at, remote_poll_key
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, COALESCE($7, NOW()), $8, $9)
     ON CONFLICT (list_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       source_json = EXCLUDED.source_json,
       dids = EXCLUDED.dids,
       member_count = EXCLUDED.member_count,
       graph_name = COALESCE(EXCLUDED.graph_name, author_list_cache.graph_name),
       refreshed_at = COALESCE(EXCLUDED.refreshed_at, author_list_cache.refreshed_at),
       next_poll_at = EXCLUDED.next_poll_at,
       remote_poll_key = EXCLUDED.remote_poll_key`,
    [
      input.listId,
      input.projectId,
      JSON.stringify(input.sourceJson),
      input.dids,
      input.memberCount,
      input.graphName ?? null,
      input.refreshedAt ?? null,
      input.nextPollAt ?? null,
      input.remotePollKey ?? null,
    ],
  )
}

export async function syncAuthorListCacheByRemotePollKey(
  pool: pg.Pool,
  remotePollKey: string,
  patch: {
    dids: string[]
    memberCount: number
    graphName?: string | null
    refreshedAt: Date
    nextPollAt: Date | null
  },
): Promise<void> {
  await pool.query(
    `UPDATE author_list_cache
     SET dids = $2,
         member_count = $3,
         graph_name = COALESCE($4, graph_name),
         refreshed_at = $5,
         next_poll_at = $6
     WHERE remote_poll_key = $1`,
    [
      remotePollKey,
      patch.dids,
      patch.memberCount,
      patch.graphName ?? null,
      patch.refreshedAt,
      patch.nextPollAt,
    ],
  )
}

export async function getAuthorListCache(
  pool: pg.Pool,
  listId: string,
): Promise<AuthorListCacheRow | null> {
  const res = await pool.query(
    `SELECT ${SELECT_COLS} FROM author_list_cache WHERE list_id = $1`,
    [listId],
  )
  const row = res.rows[0]
  return row ? rowFromDb(row) : null
}

export async function getAuthorListCacheByRemotePollKey(
  pool: pg.Pool,
  remotePollKey: string,
): Promise<AuthorListCacheRow | null> {
  const res = await pool.query(
    `SELECT ${SELECT_COLS}
     FROM author_list_cache
     WHERE remote_poll_key = $1
     ORDER BY refreshed_at DESC NULLS LAST, list_id
     LIMIT 1`,
    [remotePollKey],
  )
  const row = res.rows[0]
  return row ? rowFromDb(row) : null
}

export async function getAllAuthorListCache(pool: pg.Pool): Promise<AuthorListCacheRow[]> {
  const res = await pool.query(
    `SELECT ${SELECT_COLS} FROM author_list_cache ORDER BY list_id`,
  )
  return res.rows.map(rowFromDb)
}

/** One row per remote source (or per manual list) due for refresh. */
export async function listAuthorListsDueForPoll(
  pool: pg.Pool,
  limit = 50,
): Promise<AuthorListCacheRow[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (COALESCE(remote_poll_key, list_id))
       ${SELECT_COLS}
     FROM author_list_cache
     WHERE next_poll_at IS NOT NULL AND next_poll_at <= NOW()
     ORDER BY COALESCE(remote_poll_key, list_id), next_poll_at NULLS FIRST, list_id
     LIMIT $1`,
    [limit],
  )
  return res.rows.map(rowFromDb)
}
