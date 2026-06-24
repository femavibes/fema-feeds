import type { LabelerLabel } from '@cfb/core-types'
import { allLabelValues } from '@cfb/core-types'
import type pg from 'pg'
import type { PostSummary } from './ingest.js'
import type { IngestedPostRow } from './pool-post.js'
import { rowFromDb } from './pool-post-internal.js'

export interface LabelRefreshCandidate extends IngestedPostRow {
  labelsCheckedAt: string | null
}

/** Posts in pool due for labeler re-check (oldest / never checked first). */
export async function listPostsDueForLabelRefresh(
  pool: pg.Pool,
  options: {
    limit: number
    maxAgeDays: number
    intervalMinutes: number
  },
): Promise<LabelRefreshCandidate[]> {
  const res = await pool.query(
    `SELECT post_uri, cid, author_did, indexed_at, summary_json, labels_checked_at
     FROM ingested_posts
     WHERE indexed_at >= NOW() - ($2::int * INTERVAL '1 day')
       AND (
         labels_checked_at IS NULL
         OR labels_checked_at < NOW() - ($3::int * INTERVAL '1 minute')
       )
     ORDER BY labels_checked_at NULLS FIRST, indexed_at DESC
     LIMIT $1`,
    [options.limit, options.maxAgeDays, options.intervalMinutes],
  )
  return res.rows.map((r) => ({
    ...rowFromDb(r),
    labelsCheckedAt: r.labels_checked_at
      ? new Date(r.labels_checked_at as string).toISOString()
      : null,
  }))
}

export function labelerLabelsFingerprint(labels: LabelerLabel[]): string {
  return [...labels]
    .sort((a, b) => a.src.localeCompare(b.src) || a.val.localeCompare(b.val))
    .map((l) => `${l.src}\0${l.val}`)
    .join('\n')
}

/** Merge new labeler labels into summary_json and bump labels_checked_at. */
export async function updatePostLabelerLabels(
  pool: pg.Pool,
  postUri: string,
  labelerLabels: LabelerLabel[],
): Promise<void> {
  const res = await pool.query<{ summary_json: PostSummary }>(
    `SELECT summary_json FROM ingested_posts WHERE post_uri = $1`,
    [postUri],
  )
  const summary = res.rows[0]?.summary_json
  if (!summary) return

  const selfLabels = summary.selfLabels ?? (summary as { labels?: string[] }).labels ?? []
  const next: PostSummary = {
    ...summary,
    selfLabels,
    labelerLabels,
    allLabelVals: allLabelValues({ selfLabels, labelerLabels }),
  }

  await pool.query(
    `UPDATE ingested_posts
     SET summary_json = $2::jsonb, labels_checked_at = NOW()
     WHERE post_uri = $1`,
    [postUri, JSON.stringify(next)],
  )
}

/** All pool post URIs for an author (account-level labels apply to each). */
export async function listPoolPostUrisByAuthor(
  pool: pg.Pool,
  authorDid: string,
): Promise<string[]> {
  const res = await pool.query<{ post_uri: string }>(
    `SELECT post_uri FROM ingested_posts WHERE author_did = $1`,
    [authorDid],
  )
  return res.rows.map((r) => r.post_uri)
}

/** Mark checked even when query failed or labels unchanged. */
export async function touchPostLabelsChecked(pool: pg.Pool, postUri: string): Promise<void> {
  await pool.query(`UPDATE ingested_posts SET labels_checked_at = NOW() WHERE post_uri = $1`, [
    postUri,
  ])
}

/** Remove post from a project after L1 labels block on late-arriving label. */
export async function removePostFromProject(
  pool: pg.Pool,
  postUri: string,
  projectId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM ingested_post_projects WHERE post_uri = $1 AND project_id = $2`,
    [postUri, projectId],
  )
}

/** Drop pool row when no project associations remain. */
export async function pruneOrphanPoolPost(pool: pg.Pool, postUri: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM ingested_posts
     WHERE post_uri = $1
       AND NOT EXISTS (
         SELECT 1 FROM ingested_post_projects ip WHERE ip.post_uri = $1
       )`,
    [postUri],
  )
  return (res.rowCount ?? 0) > 0
}
