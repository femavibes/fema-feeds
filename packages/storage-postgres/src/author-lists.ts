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
  listKind: string | null
  listPurpose: string | null
  graphUri: string | null
  ownerDid: string | null
  lastManualRefreshAt: Date | null
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
  listKind?: string | null
  listPurpose?: string | null
  graphUri?: string | null
  ownerDid?: string | null
  lastManualRefreshAt?: Date | null
  /** When true, bump last_manual_refresh_at to refreshedAt/now. */
  touchManualRefresh?: boolean
}

const SELECT_COLS = `list_id, project_id, source_json, dids, member_count, graph_name, refreshed_at, next_poll_at, remote_poll_key,
  list_kind, list_purpose, graph_uri, owner_did, last_manual_refresh_at`

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
    listKind: (r.list_kind as string | null) ?? null,
    listPurpose: (r.list_purpose as string | null) ?? null,
    graphUri: (r.graph_uri as string | null) ?? null,
    ownerDid: (r.owner_did as string | null) ?? null,
    lastManualRefreshAt: r.last_manual_refresh_at
      ? new Date(r.last_manual_refresh_at as string)
      : null,
  }
}

export async function upsertAuthorListCache(
  pool: pg.Pool,
  input: UpsertAuthorListCacheInput,
): Promise<void> {
  const manualAt = input.touchManualRefresh
    ? (input.lastManualRefreshAt ?? input.refreshedAt ?? new Date())
    : (input.lastManualRefreshAt ?? null)

  await pool.query(
    `INSERT INTO author_list_cache (
       list_id, project_id, source_json, dids, member_count, graph_name, refreshed_at, next_poll_at, remote_poll_key,
       list_kind, list_purpose, graph_uri, owner_did, last_manual_refresh_at
     ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, COALESCE($7, NOW()), $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (list_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       source_json = EXCLUDED.source_json,
       dids = EXCLUDED.dids,
       member_count = EXCLUDED.member_count,
       graph_name = EXCLUDED.graph_name,
       refreshed_at = COALESCE(EXCLUDED.refreshed_at, author_list_cache.refreshed_at),
       next_poll_at = EXCLUDED.next_poll_at,
       remote_poll_key = EXCLUDED.remote_poll_key,
       list_kind = COALESCE(EXCLUDED.list_kind, author_list_cache.list_kind),
       list_purpose = COALESCE(EXCLUDED.list_purpose, author_list_cache.list_purpose),
       graph_uri = COALESCE(EXCLUDED.graph_uri, author_list_cache.graph_uri),
       owner_did = COALESCE(EXCLUDED.owner_did, author_list_cache.owner_did),
       last_manual_refresh_at = COALESCE(EXCLUDED.last_manual_refresh_at, author_list_cache.last_manual_refresh_at)`,
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
      input.listKind ?? null,
      input.listPurpose ?? null,
      input.graphUri ?? null,
      input.ownerDid ?? null,
      manualAt,
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
    listKind?: string | null
    listPurpose?: string | null
    graphUri?: string | null
    ownerDid?: string | null
    touchManualRefresh?: boolean
  },
): Promise<void> {
  await pool.query(
    `UPDATE author_list_cache
     SET dids = $2,
         member_count = $3,
         graph_name = COALESCE($4, graph_name),
         refreshed_at = $5,
         next_poll_at = $6,
         list_kind = COALESCE($7, list_kind),
         list_purpose = COALESCE($8, list_purpose),
         graph_uri = COALESCE($9, graph_uri),
         owner_did = COALESCE($10, owner_did),
         last_manual_refresh_at = CASE WHEN $11 THEN $5 ELSE last_manual_refresh_at END
     WHERE remote_poll_key = $1 OR graph_uri = $1 OR list_id = $1`,
    [
      remotePollKey,
      patch.dids,
      patch.memberCount,
      patch.graphName ?? null,
      patch.refreshedAt,
      patch.nextPollAt,
      patch.listKind ?? null,
      patch.listPurpose ?? null,
      patch.graphUri ?? null,
      patch.ownerDid ?? null,
      Boolean(patch.touchManualRefresh),
    ],
  )
}

export async function patchAuthorListMembership(
  pool: pg.Pool,
  graphUri: string,
  dids: string[],
): Promise<void> {
  const now = new Date()
  await pool.query(
    `UPDATE author_list_cache
     SET dids = $2,
         member_count = $3,
         refreshed_at = $4
     WHERE graph_uri = $1 OR remote_poll_key = $1 OR list_id = $1`,
    [graphUri, dids, dids.length, now],
  )
}

/** Jetstream listitem create — append subject if missing. */
export async function addAuthorListMember(
  pool: pg.Pool,
  graphUri: string,
  subjectDid: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE author_list_cache
     SET dids = CASE WHEN $2 = ANY(dids) THEN dids ELSE array_append(dids, $2) END,
         member_count = cardinality(
           CASE WHEN $2 = ANY(dids) THEN dids ELSE array_append(dids, $2) END
         ),
         refreshed_at = NOW()
     WHERE graph_uri = $1 OR remote_poll_key = $1 OR list_id = $1
     RETURNING list_id`,
    [graphUri, subjectDid],
  )
  return (res.rowCount ?? 0) > 0
}

/** Jetstream listitem delete — remove subject. */
export async function removeAuthorListMember(
  pool: pg.Pool,
  graphUri: string,
  subjectDid: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE author_list_cache
     SET dids = array_remove(dids, $2),
         member_count = cardinality(array_remove(dids, $2)),
         refreshed_at = NOW()
     WHERE graph_uri = $1 OR remote_poll_key = $1 OR list_id = $1
     RETURNING list_id`,
    [graphUri, subjectDid],
  )
  return (res.rowCount ?? 0) > 0
}

export async function upsertListitemIndex(
  pool: pg.Pool,
  input: { listitemUri: string; listUri: string; subjectDid: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO bluesky_listitem_index (listitem_uri, list_uri, subject_did)
     VALUES ($1, $2, $3)
     ON CONFLICT (listitem_uri) DO UPDATE SET
       list_uri = EXCLUDED.list_uri,
       subject_did = EXCLUDED.subject_did`,
    [input.listitemUri, input.listUri, input.subjectDid],
  )
}

export async function takeListitemIndex(
  pool: pg.Pool,
  listitemUri: string,
): Promise<{ listUri: string; subjectDid: string } | null> {
  const res = await pool.query<{ list_uri: string; subject_did: string }>(
    `DELETE FROM bluesky_listitem_index WHERE listitem_uri = $1
     RETURNING list_uri, subject_did`,
    [listitemUri],
  )
  const row = res.rows[0]
  if (!row) return null
  return { listUri: row.list_uri, subjectDid: row.subject_did }
}

export async function getAuthorListCache(
  pool: pg.Pool,
  listId: string,
): Promise<AuthorListCacheRow | null> {
  const res = await pool.query(
    `SELECT ${SELECT_COLS} FROM author_list_cache WHERE list_id = $1 OR graph_uri = $1 OR remote_poll_key = $1
     ORDER BY CASE WHEN list_id = $1 THEN 0 ELSE 1 END, refreshed_at DESC NULLS LAST
     LIMIT 1`,
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
     WHERE remote_poll_key = $1 OR graph_uri = $1 OR list_id = $1
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

export async function listDistinctOwnerDidsForLists(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ owner_did: string }>(
    `SELECT DISTINCT owner_did FROM author_list_cache
     WHERE owner_did IS NOT NULL AND (list_kind IS NULL OR list_kind IN ('list', 'starterpack'))`,
  )
  return res.rows.map((r) => r.owner_did)
}

/** One row per remote source (or per manual list) due for audit refresh. */
export async function listAuthorListsDueForPoll(
  pool: pg.Pool,
  limit = 50,
): Promise<AuthorListCacheRow[]> {
  const res = await pool.query(
    `SELECT DISTINCT ON (COALESCE(graph_uri, remote_poll_key, list_id))
       ${SELECT_COLS}
     FROM author_list_cache
     WHERE next_poll_at IS NOT NULL AND next_poll_at <= NOW()
     ORDER BY COALESCE(graph_uri, remote_poll_key, list_id), next_poll_at NULLS FIRST, list_id
     LIMIT $1`,
    [limit],
  )
  return res.rows.map(rowFromDb)
}
