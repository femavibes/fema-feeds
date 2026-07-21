import type { L2NodeTrace } from '@cfb/core-types'
import type pg from 'pg'

export async function recordFeedParamMatch(
  pool: pg.Pool,
  feedId: string,
  trace: L2NodeTrace[],
  authorDid: string,
): Promise<void> {
  const now = new Date()
  await pool.query(
    `INSERT INTO feed_param_match_events (feed_id, node_id, matched_at) VALUES ($1, '', $2)`,
    [feedId, now],
  )
  for (const t of trace) {
    if (t.outcome !== 'pass') continue
    await pool.query(
      `INSERT INTO feed_param_match_events (feed_id, node_id, matched_at) VALUES ($1, $2, $3)`,
      [feedId, t.nodeId, now],
    )
  }
  const nodeUpdates: Record<string, string> = {}
  for (const t of trace) {
    if (t.outcome === 'pass') nodeUpdates[t.nodeId] = now.toISOString()
  }
  await pool.query(
    `INSERT INTO feed_param_trigger_state (feed_id, last_feed_match_at, last_node_match_at, recent_author_posts)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (feed_id) DO UPDATE SET
       last_feed_match_at = EXCLUDED.last_feed_match_at,
       last_node_match_at = feed_param_trigger_state.last_node_match_at || EXCLUDED.last_node_match_at,
       recent_author_posts = (
         SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM (
           SELECT elem FROM jsonb_array_elements(
             feed_param_trigger_state.recent_author_posts || EXCLUDED.recent_author_posts
           ) AS elem
           ORDER BY (elem->>'at') DESC
           LIMIT 200
         ) sub
       )`,
    [
      feedId,
      now,
      JSON.stringify(nodeUpdates),
      JSON.stringify([{ did: authorDid, at: now.toISOString() }]),
    ],
  )
}

export async function countFeedParamMatches(
  pool: pg.Pool,
  feedId: string,
  windowMinutes: number,
  nodeId?: string,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)
  const res = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM feed_param_match_events
     WHERE feed_id = $1 AND node_id = $2 AND matched_at >= $3`,
    [feedId, nodeId ?? '', since],
  )
  return Number(res.rows[0]?.n ?? 0)
}

export async function getFeedParamLastMatchAt(
  pool: pg.Pool,
  feedId: string,
  nodeId?: string,
): Promise<Date | null> {
  if (!nodeId) {
    const res = await pool.query<{ t: Date | null }>(
      `SELECT last_feed_match_at AS t FROM feed_param_trigger_state WHERE feed_id = $1`,
      [feedId],
    )
    const t = res.rows[0]?.t
    return t ? new Date(t) : null
  }
  const res = await pool.query<{ last_node_match_at: Record<string, string> }>(
    `SELECT last_node_match_at FROM feed_param_trigger_state WHERE feed_id = $1`,
    [feedId],
  )
  const raw = res.rows[0]?.last_node_match_at?.[nodeId]
  return raw ? new Date(raw) : null
}

export async function authorPostedRecentlyForFeed(
  pool: pg.Pool,
  feedId: string,
  authorDids: string[],
  authorListIds: string[],
  lookbackMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000)
  const didSet = new Set(authorDids.map((d) => d.trim()).filter(Boolean))
  if (authorListIds.length > 0) {
    const lists = await pool.query<{ dids: string[] }>(
      `SELECT dids FROM author_list_cache WHERE list_id = ANY($1::text[])`,
      [authorListIds],
    )
    for (const row of lists.rows) {
      for (const d of row.dids ?? []) didSet.add(d)
    }
  }
  if (didSet.size === 0) return false
  const res = await pool.query<{ recent_author_posts: Array<{ did: string; at: string }> }>(
    `SELECT recent_author_posts FROM feed_param_trigger_state WHERE feed_id = $1`,
    [feedId],
  )
  const posts = res.rows[0]?.recent_author_posts ?? []
  return posts.some(
    (p) => didSet.has(p.did) && new Date(p.at).getTime() >= since.getTime(),
  )
}

export async function getAuthorListMemberCount(
  pool: pg.Pool,
  listId: string,
): Promise<number | null> {
  const res = await pool.query<{ member_count: number | null }>(
    `SELECT member_count FROM author_list_cache WHERE list_id = $1 OR graph_uri = $1 LIMIT 1`,
    [listId],
  )
  const n = res.rows[0]?.member_count
  return n == null ? null : Number(n)
}

export async function noteListMemberCount(
  pool: pg.Pool,
  feedId: string,
  listId: string,
  memberCount: number,
): Promise<'member_added' | 'member_removed' | 'any_change' | null> {
  const res = await pool.query<{ list_member_counts: Record<string, number> }>(
    `SELECT list_member_counts FROM feed_param_trigger_state WHERE feed_id = $1`,
    [feedId],
  )
  const prev = res.rows[0]?.list_member_counts?.[listId]
  let event: 'member_added' | 'member_removed' | 'any_change' | null = null
  if (prev !== undefined) {
    if (memberCount > prev) event = 'member_added'
    else if (memberCount < prev) event = 'member_removed'
  }
  const pendingPatch = event ? JSON.stringify({ [listId]: event }) : '{}'
  await pool.query(
    `INSERT INTO feed_param_trigger_state (feed_id, list_member_counts, pending_list_events)
     VALUES ($1, jsonb_build_object($2::text, $3::int), $4::jsonb)
     ON CONFLICT (feed_id) DO UPDATE SET
       list_member_counts = feed_param_trigger_state.list_member_counts || jsonb_build_object($2::text, $3::int),
       pending_list_events = CASE
         WHEN $4::jsonb = '{}'::jsonb THEN feed_param_trigger_state.pending_list_events
         ELSE feed_param_trigger_state.pending_list_events || $4::jsonb
       END`,
    [feedId, listId, memberCount, pendingPatch],
  )
  return event
}

export async function takePendingListEvent(
  pool: pg.Pool,
  feedId: string,
  listId: string,
): Promise<'member_added' | 'member_removed' | 'any_change' | null> {
  const res = await pool.query<{ pending_list_events: Record<string, string> }>(
    `SELECT pending_list_events FROM feed_param_trigger_state WHERE feed_id = $1`,
    [feedId],
  )
  const ev = res.rows[0]?.pending_list_events?.[listId] as
    | 'member_added'
    | 'member_removed'
    | 'any_change'
    | undefined
  if (!ev) return null
  await pool.query(
    `UPDATE feed_param_trigger_state
     SET pending_list_events = pending_list_events - $2
     WHERE feed_id = $1`,
    [feedId, listId],
  )
  return ev
}

export async function pruneOldParamMatchEvents(pool: pg.Pool, olderThanHours = 48): Promise<void> {
  const since = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
  await pool.query(`DELETE FROM feed_param_match_events WHERE matched_at < $1`, [since])
}
