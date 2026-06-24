import type { L1MatchedVia, L1ProjectResult, NormalizedPost } from '@cfb/core-types'
import { allLabelValues as computeAllLabelVals } from '@cfb/core-types'
import { buildPostRankSnapshot } from '@cfb/post-normalize'
import type pg from 'pg'

/** Eval snapshot persisted in ingested_posts.summary_json (identity columns stored separately). */
export type StoredPostData = Omit<NormalizedPost, 'uri' | 'cid' | 'authorDid' | 'indexedAt'>

/** @deprecated Alias — same shape as StoredPostData. */
export type PostSummary = StoredPostData

export function buildPostSummary(post: NormalizedPost): StoredPostData {
  const { uri: _u, cid: _c, authorDid: _a, indexedAt: _i, ...data } = post
  return {
    ...data,
    allLabelVals: computeAllLabelVals(post),
  }
}

export function buildRankSnapshotJson(post: NormalizedPost): string {
  return JSON.stringify(buildPostRankSnapshot(post))
}

export interface PersistL1MatchInput {
  post: NormalizedPost
  matches: L1ProjectResult[]
  /** Optional TTL for ingested rows (testing: omit or set short). */
  expiresAt?: Date | null
}

/** Upsert post + project associations for L1 passes. */
export async function persistL1Matches(
  pool: pg.Pool,
  input: PersistL1MatchInput,
): Promise<{ insertedProjectIds: string[] }> {
  const { post, matches, expiresAt } = input
  if (matches.length === 0) return { insertedProjectIds: [] }

  const client = await pool.connect()
  const insertedProjectIds: string[] = []
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO ingested_posts (post_uri, cid, author_did, indexed_at, summary_json, rank_snapshot, expires_at, labels_checked_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
       ON CONFLICT (post_uri) DO UPDATE SET
         summary_json = EXCLUDED.summary_json,
         rank_snapshot = EXCLUDED.rank_snapshot,
         expires_at = COALESCE(EXCLUDED.expires_at, ingested_posts.expires_at),
         labels_checked_at = NOW()`,
      [
        post.uri,
        post.cid,
        post.authorDid,
        post.indexedAt,
        JSON.stringify(buildPostSummary(post)),
        buildRankSnapshotJson(post),
        expiresAt ?? null,
      ],
    )

    for (const match of matches) {
      const matchedVia = normalizeMatchedVia(match.matchedVia)
      const res = await client.query<{ project_id: string }>(
        `INSERT INTO ingested_post_projects (post_uri, project_id, matched_via)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_uri, project_id) DO NOTHING
         RETURNING project_id`,
        [post.uri, match.projectId, matchedVia],
      )
      if (res.rows[0]) insertedProjectIds.push(res.rows[0].project_id)
    }

    await client.query(
      `INSERT INTO post_engagement (post_uri) VALUES ($1)
       ON CONFLICT (post_uri) DO NOTHING`,
      [post.uri],
    )

    await client.query('COMMIT')
    return { insertedProjectIds }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function normalizeMatchedVia(via?: L1MatchedVia): 'author' | 'jetstream' | 'plugin' {
  if (via === 'author') return 'author'
  return 'jetstream'
}
