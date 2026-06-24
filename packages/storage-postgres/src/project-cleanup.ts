import type pg from 'pg'

/** Remove DB rows tied to a deleted project; prune posts with no remaining project tags. */
export async function deleteProjectData(pool: pg.Pool, projectId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM ingested_post_projects WHERE project_id = $1', [projectId])
    await client.query('DELETE FROM author_list_cache WHERE project_id = $1', [projectId])
    await client.query(
      `DELETE FROM ingested_posts
       WHERE post_uri NOT IN (SELECT post_uri FROM ingested_post_projects)`,
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
