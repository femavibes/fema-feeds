import type { Pool } from 'pg'
import type { NormalizedPost } from '@cfb/core-types'
import type { IntelligenceConfig } from './types.js'
import { DEFAULT_INTELLIGENCE_CONFIG } from './types.js'
import { extractSignals } from './extract.js'
import { SignalCounter, PoolCounterSet } from './counters.js'
import { replacePoolSignals, replaceFirehoseBaseline } from './storage.js'

export interface BackfillResult {
  postsProcessed: number
  projectSignalsFlushed: number
  feedSignalsFlushed: number
  firehoseSignalsFlushed: number
  firehosePostsSampled: number
}

function postFromSummary(row: { summary_json: any; post_uri: string; author_did: string }): NormalizedPost {
  const s = row.summary_json
  return {
    uri: row.post_uri,
    cid: '',
    authorDid: row.author_did,
    text: s.text ?? '',
    createdAt: s.createdAt ?? '',
    indexedAt: '',
    postKind: s.postKind ?? 'root',
    langs: s.langs ?? [],
    facetTags: s.facetTags ?? [],
    facetLinks: s.facetLinks ?? [],
    facetMentions: s.facetMentions ?? [],
    selfLabels: s.selfLabels ?? [],
    labelerLabels: s.labelerLabels ?? [],
    allLabelVals: s.allLabelVals ?? [],
    embed: s.embed ?? { hasImage: false, hasVideo: false, hasQuote: false, hasRecord: false, hasLinkCard: false, hasTextOnly: true },
    reply: s.reply ?? undefined,
    recordType: s.recordType ?? 'app.bsky.feed.post',
    outlineTags: s.outlineTags ?? [],
    hiddenFacetTags: s.hiddenFacetTags ?? [],
  }
}

/**
 * Backfill intelligence signals from existing pool posts + live jetstream sampling.
 * 1. Calls `sampleFirehose` to build real firehose baseline
 * 2. Scans ingested_posts for pool + feed signals
 */
export async function backfillIntelligence(
  pool: Pool,
  opts?: {
    projectId?: string
    limit?: number
    sampleSeconds?: number
    config?: Partial<IntelligenceConfig>
    /** Samples jetstream for N seconds, calling onPost for each. Returns when done. */
    sampleFirehose?: (onPost: (post: NormalizedPost) => void, seconds: number) => Promise<void>
  },
): Promise<BackfillResult> {
  const config = { ...DEFAULT_INTELLIGENCE_CONFIG, ...opts?.config }
  const limit = opts?.limit ?? 50000
  const sampleSeconds = opts?.sampleSeconds ?? 30
  const batchSize = 1000

  const poolCounters = new PoolCounterSet()
  const feedCounters = new PoolCounterSet()
  const firehoseCounter = new SignalCounter()
  let postsProcessed = 0

  // Step 1: Sample jetstream for real firehose baseline
  if (opts?.sampleFirehose) {
    await opts.sampleFirehose((post) => {
      const signals = extractSignals(post, config.language)
      firehoseCounter.record(signals)
    }, sampleSeconds)
  }

  // Step 2: Scan existing pool posts for project + feed signals
  let offset = 0
  while (postsProcessed < limit) {
    const projectFilter = opts?.projectId ? `AND ipp.project_id = $3` : ''
    const params: unknown[] = opts?.projectId
      ? [batchSize, offset, opts.projectId]
      : [batchSize, offset]

    const { rows } = await pool.query<{
      summary_json: any
      post_uri: string
      author_did: string
      project_ids: string[]
      feed_ids: string[]
    }>(
      `SELECT ip.summary_json, ip.post_uri, ip.author_did,
              array_agg(DISTINCT ipp.project_id) as project_ids,
              COALESCE(array_agg(DISTINCT fc.feed_id) FILTER (WHERE fc.feed_id IS NOT NULL), '{}') as feed_ids
       FROM ingested_posts ip
       JOIN ingested_post_projects ipp ON ip.post_uri = ipp.post_uri
       LEFT JOIN feed_candidates fc ON ip.post_uri = fc.post_uri
       WHERE ip.summary_json IS NOT NULL ${projectFilter}
       GROUP BY ip.post_uri, ip.summary_json, ip.author_did
       ORDER BY ip.indexed_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    )

    if (rows.length === 0) break

    for (const row of rows) {
      const post = postFromSummary(row)
      const signals = extractSignals(post, config.language)

      for (const pid of row.project_ids) {
        poolCounters.getOrCreate(pid).record(signals)
      }

      for (const fid of row.feed_ids) {
        if (fid) feedCounters.getOrCreate(`feed:${fid}`).record(signals)
      }

      postsProcessed++
    }

    offset += batchSize
  }

  // Flush pool signals (replace mode — delete old, insert fresh)
  let projectSignalsFlushed = 0
  const poolSnapshots = poolCounters.flushAll()
  for (const [projectId, snapshot] of poolSnapshots) {
    await replacePoolSignals(pool, projectId, snapshot)
    projectSignalsFlushed += snapshot.entries.length
  }

  // Flush feed signals (replace mode)
  let feedSignalsFlushed = 0
  const feedSnapshots = feedCounters.flushAll()
  for (const [key, snapshot] of feedSnapshots) {
    await replacePoolSignals(pool, key, snapshot)
    feedSignalsFlushed += snapshot.entries.length
  }

  // Flush firehose baseline (replace mode, no topK limit for backfill)
  let firehoseSignalsFlushed = 0
  if (firehoseCounter.totalPosts > 0) {
    const snapshot = firehoseCounter.flush()
    // Only keep firehose signals that also appear in the pool (focused baseline)
    const poolSignalKeys = new Set<string>()
    for (const [, snap] of poolSnapshots) {
      for (const e of snap.entries) poolSignalKeys.add(`${e.type}\x00${e.value}`)
    }
    for (const [, snap] of feedSnapshots) {
      for (const e of snap.entries) poolSignalKeys.add(`${e.type}\x00${e.value}`)
    }
    snapshot.entries = snapshot.entries.filter(
      (e) => poolSignalKeys.has(`${e.type}\x00${e.value}`),
    )
    await replaceFirehoseBaseline(pool, snapshot, snapshot.entries.length)
    firehoseSignalsFlushed = snapshot.entries.length
  }

  return { postsProcessed, projectSignalsFlushed, feedSignalsFlushed, firehoseSignalsFlushed, firehosePostsSampled: firehoseCounter.totalPosts }
}
