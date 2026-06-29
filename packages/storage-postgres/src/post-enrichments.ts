import type pg from 'pg'

export interface PostEnrichmentRow {
  postUri: string
  enricherId: string
  version: string
  data: Record<string, unknown>
  enrichedAt: string
}

/** Get all enrichments for a post (all enrichers). */
export async function getPostEnrichments(
  pool: pg.Pool,
  postUri: string,
): Promise<Record<string, Record<string, unknown>>> {
  const res = await pool.query<{ enricher_id: string; data: Record<string, unknown> }>(
    `SELECT enricher_id, data FROM post_enrichments WHERE post_uri = $1`,
    [postUri],
  )
  const out: Record<string, Record<string, unknown>> = {}
  for (const row of res.rows) {
    out[row.enricher_id] = row.data
  }
  return out
}

/** Batch-get enrichments for multiple posts. Returns map of postUri → { enricherId → data }. */
export async function getPostEnrichmentsBatch(
  pool: pg.Pool,
  postUris: string[],
): Promise<Map<string, Record<string, Record<string, unknown>>>> {
  if (postUris.length === 0) return new Map()
  const res = await pool.query<{ post_uri: string; enricher_id: string; data: Record<string, unknown> }>(
    `SELECT post_uri, enricher_id, data FROM post_enrichments WHERE post_uri = ANY($1::text[])`,
    [postUris],
  )
  const map = new Map<string, Record<string, Record<string, unknown>>>()
  for (const row of res.rows) {
    let entry = map.get(row.post_uri)
    if (!entry) {
      entry = {}
      map.set(row.post_uri, entry)
    }
    entry[row.enricher_id] = row.data
  }
  return map
}

/** Write enrichment data for a post (upserts). */
export async function upsertPostEnrichment(
  pool: pg.Pool,
  postUri: string,
  enricherId: string,
  version: string,
  data: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO post_enrichments (post_uri, enricher_id, version, data, enriched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (post_uri, enricher_id)
     DO UPDATE SET data = $4, version = $3, enriched_at = NOW()`,
    [postUri, enricherId, version, JSON.stringify(data)],
  )
}

/** Batch-write enrichments for multiple posts. */
export async function upsertPostEnrichmentsBatch(
  pool: pg.Pool,
  rows: Array<{ postUri: string; enricherId: string; version: string; data: Record<string, unknown> }>,
): Promise<void> {
  if (rows.length === 0) return
  const values: string[] = []
  const params: unknown[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const base = i * 4
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW())`)
    params.push(row.postUri, row.enricherId, row.version, JSON.stringify(row.data))
  }
  await pool.query(
    `INSERT INTO post_enrichments (post_uri, enricher_id, version, data, enriched_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (post_uri, enricher_id)
     DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, enriched_at = NOW()`,
    params,
  )
}

/** Delete all enrichments for a specific enricher (e.g., when uninstalling). */
export async function deleteEnrichmentsByEnricher(
  pool: pg.Pool,
  enricherId: string,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM post_enrichments WHERE enricher_id = $1`,
    [enricherId],
  )
  return res.rowCount ?? 0
}

/** Count posts that haven't been enriched by a given enricher (for sweep progress). */
export async function countUnenrichedPosts(
  pool: pg.Pool,
  enricherId: string,
  projectId?: string,
): Promise<number> {
  if (projectId) {
    const res = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM ingested_post_projects ip
       WHERE ip.project_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM post_enrichments pe
           WHERE pe.post_uri = ip.post_uri AND pe.enricher_id = $2
         )`,
      [projectId, enricherId],
    )
    return res.rows[0]?.n ?? 0
  }
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM ingested_posts p
     WHERE NOT EXISTS (
       SELECT 1 FROM post_enrichments pe
       WHERE pe.post_uri = p.post_uri AND pe.enricher_id = $1
     )`,
    [enricherId],
  )
  return res.rows[0]?.n ?? 0
}

/** List post URIs that need enrichment (for background sweep). */
export async function listUnenrichedPostUris(
  pool: pg.Pool,
  enricherId: string,
  limit: number,
  projectId?: string,
): Promise<string[]> {
  if (projectId) {
    const res = await pool.query<{ post_uri: string }>(
      `SELECT ip.post_uri
       FROM ingested_post_projects ip
       WHERE ip.project_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM post_enrichments pe
           WHERE pe.post_uri = ip.post_uri AND pe.enricher_id = $2
         )
       LIMIT $3`,
      [projectId, enricherId, limit],
    )
    return res.rows.map((r) => r.post_uri)
  }
  const res = await pool.query<{ post_uri: string }>(
    `SELECT p.post_uri
     FROM ingested_posts p
     WHERE NOT EXISTS (
       SELECT 1 FROM post_enrichments pe
       WHERE pe.post_uri = p.post_uri AND pe.enricher_id = $1
     )
     ORDER BY p.indexed_at DESC
     LIMIT $2`,
    [enricherId, limit],
  )
  return res.rows.map((r) => r.post_uri)
}
