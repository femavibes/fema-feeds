import type pg from 'pg'
import type { PostSummary } from './ingest.js'
import type { IngestedPostRow } from './pool-post.js'

export function rowFromDb(r: pg.QueryResultRow): IngestedPostRow {
  const summary = r.summary_json as PostSummary
  return {
    postUri: r.post_uri as string,
    cid: r.cid as string,
    authorDid: r.author_did as string,
    indexedAt: new Date(r.indexed_at as string).toISOString(),
    summary,
  }
}
