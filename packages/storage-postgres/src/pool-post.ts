import type { EmbedFlags, NormalizedPost, PostKind } from '@cfb/core-types'
import { allLabelValues } from '@cfb/core-types'
import type pg from 'pg'
import type { PostSummary } from './ingest.js'
import { rowFromDb } from './pool-post-internal.js'

export interface IngestedPostRow {
  postUri: string
  cid: string
  authorDid: string
  indexedAt: string
  summary: PostSummary
}

const EMPTY_EMBED: EmbedFlags = {
  hasVideo: false,
  hasImage: false,
  hasLinkCard: false,
  hasQuote: false,
  hasRecord: false,
  hasTextOnly: true,
}

type LegacySummary = PostSummary & { labels?: string[] }

function mergeSummary(summary: PostSummary, indexedAt: string): StoredPostFields {
  const legacy = summary as LegacySummary
  const selfLabels = summary.selfLabels ?? legacy.labels ?? []
  const labelerLabels = summary.labelerLabels ?? []
  return {
    recordType: summary.recordType ?? 'app.bsky.feed.post',
    text: summary.text ?? '',
    createdAt: summary.createdAt ?? indexedAt,
    langs: summary.langs ?? [],
    selfLabels,
    labelerLabels,
    allLabelVals: summary.allLabelVals ?? allLabelValues({ selfLabels, labelerLabels }),
    postKind: (summary.postKind as PostKind) ?? 'root',
    embed: summary.embed ?? EMPTY_EMBED,
    embedDetail: summary.embedDetail,
    reply: summary.reply,
    facetTags: summary.facetTags ?? [],
    hiddenFacetTags: summary.hiddenFacetTags ?? [],
    facetLinks: summary.facetLinks ?? [],
    facetMentions: summary.facetMentions ?? [],
    outlineTags: summary.outlineTags ?? [],
    bridgyOriginalText: summary.bridgyOriginalText,
    bridgyOriginalUrl: summary.bridgyOriginalUrl,
  }
}

type StoredPostFields = Omit<NormalizedPost, 'uri' | 'cid' | 'authorDid' | 'indexedAt'>

export function normalizedPostFromRow(row: IngestedPostRow): NormalizedPost {
  const fields = mergeSummary(row.summary, row.indexedAt)
  return {
    uri: row.postUri,
    cid: row.cid,
    authorDid: row.authorDid,
    indexedAt: row.indexedAt,
    ...fields,
  }
}

function rowFromDbLocal(r: pg.QueryResultRow): IngestedPostRow {
  return rowFromDb(r)
}

export async function listPostsForProject(
  pool: pg.Pool,
  projectId: string,
  limit: number,
  cursor?: string,
): Promise<IngestedPostRow[]> {
  if (cursor) {
    const res = await pool.query(
      `SELECT p.post_uri, p.cid, p.author_did, p.indexed_at, p.summary_json
       FROM ingested_posts p
       INNER JOIN ingested_post_projects ip ON ip.post_uri = p.post_uri
       WHERE ip.project_id = $1 AND p.indexed_at < $2
       ORDER BY p.indexed_at DESC
       LIMIT $3`,
      [projectId, cursor, limit],
    )
    return res.rows.map(rowFromDbLocal)
  }
  const res = await pool.query(
    `SELECT p.post_uri, p.cid, p.author_did, p.indexed_at, p.summary_json
     FROM ingested_posts p
     INNER JOIN ingested_post_projects ip ON ip.post_uri = p.post_uri
     WHERE ip.project_id = $1
     ORDER BY p.indexed_at DESC
     LIMIT $2`,
    [projectId, limit],
  )
  return res.rows.map(rowFromDbLocal)
}

export async function listAllPoolPosts(
  pool: pg.Pool,
  limit: number,
  cursor?: string,
): Promise<IngestedPostRow[]> {
  if (cursor) {
    const res = await pool.query(
      `SELECT post_uri, cid, author_did, indexed_at, summary_json
       FROM ingested_posts
       WHERE indexed_at < $1
       ORDER BY indexed_at DESC
       LIMIT $2`,
      [cursor, limit],
    )
    return res.rows.map(rowFromDbLocal)
  }
  const res = await pool.query(
    `SELECT post_uri, cid, author_did, indexed_at, summary_json
     FROM ingested_posts
     ORDER BY indexed_at DESC
     LIMIT $1`,
    [limit],
  )
  return res.rows.map(rowFromDbLocal)
}

/** List pool posts with an additional SQL WHERE clause for pre-filtering. */
export async function listPoolPostsFiltered(
  pool: pg.Pool,
  limit: number,
  offset: number,
  where: string,
  whereParams: unknown[],
  cursor?: string,
): Promise<IngestedPostRow[]> {
  const cursorClause = cursor
    ? ` AND indexed_at < $${whereParams.length + 1}`
    : ''
  const cursorParams = cursor ? [cursor] : []
  const allParams = [...whereParams, ...cursorParams]
  const res = await pool.query(
    `SELECT post_uri, cid, author_did, indexed_at, summary_json
     FROM ingested_posts
     WHERE ${where}${cursorClause}
     ORDER BY indexed_at DESC
     LIMIT $${allParams.length + 1}`,
    [...allParams, limit],
  )
  return res.rows.map(rowFromDbLocal)
}

/** Count pool posts matching a WHERE clause. */
export async function countPoolPostsFiltered(
  pool: pg.Pool,
  where: string,
  whereParams: unknown[],
): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ingested_posts WHERE ${where}`,
    whereParams,
  )
  return Number(res.rows[0]?.count ?? 0)
}

export async function countPostsForProject(pool: pg.Pool, projectId: string): Promise<number> {
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM ingested_post_projects WHERE project_id = $1`,
    [projectId],
  )
  return res.rows[0]?.n ?? 0
}

export async function countAllPoolPosts(pool: pg.Pool): Promise<number> {
  const res = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ingested_posts`)
  return res.rows[0]?.n ?? 0
}

export async function getIngestedPost(
  pool: pg.Pool,
  postUri: string,
): Promise<IngestedPostRow | null> {
  const res = await pool.query(
    `SELECT post_uri, cid, author_did, indexed_at, summary_json
     FROM ingested_posts WHERE post_uri = $1`,
    [postUri],
  )
  const row = res.rows[0]
  return row ? rowFromDbLocal(row) : null
}

export async function getProjectIdsForPost(
  pool: pg.Pool,
  postUri: string,
): Promise<string[]> {
  const res = await pool.query<{ project_id: string }>(
    `SELECT project_id FROM ingested_post_projects WHERE post_uri = $1`,
    [postUri],
  )
  return res.rows.map((r) => r.project_id)
}

/** Batch-fetch project IDs for multiple post URIs. */
export async function getProjectIdsForPostsBatch(
  pool: pg.Pool,
  postUris: string[],
): Promise<Map<string, string[]>> {
  if (postUris.length === 0) return new Map()
  const res = await pool.query<{ post_uri: string; project_id: string }>(
    `SELECT post_uri, project_id FROM ingested_post_projects WHERE post_uri = ANY($1::text[])`,
    [postUris],
  )
  const map = new Map<string, string[]>()
  for (const r of res.rows) {
    const arr = map.get(r.post_uri) ?? []
    arr.push(r.project_id)
    map.set(r.post_uri, arr)
  }
  return map
}
