import type { SubstitutionVote, SubstitutionTarget } from '@cfb/core-types'
import type pg from 'pg'

export async function ensureSubstitutionTables(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS substitution_votes (
      id            SERIAL PRIMARY KEY,
      project_id    TEXT NOT NULL,
      feed_id       TEXT NOT NULL,
      pathway_id    TEXT NOT NULL,
      target_uri    TEXT NOT NULL,
      source_uri    TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sub_votes_target
      ON substitution_votes(project_id, feed_id, pathway_id, target_uri);
    CREATE INDEX IF NOT EXISTS idx_sub_votes_source
      ON substitution_votes(source_uri);
  `)
}

export async function insertSubstitutionVote(
  pool: pg.Pool,
  vote: Omit<SubstitutionVote, 'id' | 'createdAt'>,
): Promise<void> {
  await pool.query(
    `INSERT INTO substitution_votes (project_id, feed_id, pathway_id, target_uri, source_uri)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [vote.projectId, vote.feedId, vote.pathwayId, vote.targetUri, vote.sourceUri],
  )
}

export async function getSubstitutionVoteCount(
  pool: pg.Pool,
  projectId: string,
  feedId: string,
  pathwayId: string,
  targetUri: string,
  timeWindowHours?: number,
): Promise<number> {
  const timeClause = timeWindowHours && timeWindowHours > 0
    ? ` AND created_at > NOW() - interval '${timeWindowHours} hours'`
    : ''
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM substitution_votes
     WHERE project_id = $1 AND feed_id = $2 AND pathway_id = $3 AND target_uri = $4${timeClause}`,
    [projectId, feedId, pathwayId, targetUri],
  )
  return Number(res.rows[0]?.count ?? 0)
}

export async function getSubstitutionTargets(
  pool: pg.Pool,
  projectId: string,
  feedId: string,
  pathwayId: string,
  threshold: number,
  timeWindowHours?: number,
): Promise<SubstitutionTarget[]> {
  const timeClause = timeWindowHours && timeWindowHours > 0
    ? ` AND created_at > NOW() - interval '${timeWindowHours} hours'`
    : ''
  const res = await pool.query<{ target_uri: string; vote_count: string }>(
    `SELECT target_uri, COUNT(*) as vote_count FROM substitution_votes
     WHERE project_id = $1 AND feed_id = $2 AND pathway_id = $3${timeClause}
     GROUP BY target_uri
     HAVING COUNT(*) >= $4`,
    [projectId, feedId, pathwayId, threshold],
  )
  return res.rows.map((r) => ({
    targetUri: r.target_uri,
    voteCount: Number(r.vote_count),
    ready: true,
  }))
}

/** Check if a specific source already voted for a target in this pathway. */
export async function hasVoted(
  pool: pg.Pool,
  projectId: string,
  feedId: string,
  pathwayId: string,
  targetUri: string,
  sourceUri: string,
): Promise<boolean> {
  const res = await pool.query<{ n: number }>(
    `SELECT 1 as n FROM substitution_votes
     WHERE project_id = $1 AND feed_id = $2 AND pathway_id = $3
       AND target_uri = $4 AND source_uri = $5
     LIMIT 1`,
    [projectId, feedId, pathwayId, targetUri, sourceUri],
  )
  return res.rows.length > 0
}

/** Delete all votes for a project (used in project cleanup). */
export async function deleteSubstitutionVotesForProject(
  pool: pg.Pool,
  projectId: string,
): Promise<void> {
  await pool.query(`DELETE FROM substitution_votes WHERE project_id = $1`, [projectId])
}
