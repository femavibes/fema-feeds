import type { GlobalPurgeSettings, PurgePolicy, PurgeRule } from '@cfb/core-types'
import { DEFAULT_GLOBAL_PURGE_SETTINGS } from '@cfb/core-types'
import type pg from 'pg'

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getGlobalPurgeSettings(pool: pg.Pool): Promise<GlobalPurgeSettings> {
  const res = await pool.query(
    `SELECT value_json FROM deployment_settings WHERE key = 'purge'`,
  )
  const row = res.rows[0]?.value_json as Partial<GlobalPurgeSettings> | undefined
  return { ...DEFAULT_GLOBAL_PURGE_SETTINGS, ...row }
}

export async function saveGlobalPurgeSettings(
  pool: pg.Pool,
  settings: GlobalPurgeSettings,
): Promise<void> {
  await pool.query(
    `INSERT INTO deployment_settings (key, value_json, updated_at)
     VALUES ('purge', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(settings)],
  )
}

// ─── Sweep logic ─────────────────────────────────────────────────────────────

export interface PurgeSweepResult {
  scanned: number
  purged: number
  dryRun: boolean
}

interface PurgeCandidate {
  post_uri: string
  indexed_at: Date
  like_count: number
  repost_count: number
  reply_count: number
  quote_count: number
  has_candidate: boolean
  project_count: number
  post_kind: string
  has_media: boolean
  is_text_only: boolean
  labeled_nsfw: boolean
  editor_score: number
}

const NSFW_LABELS = ['porn', 'sexual', 'nudity', 'graphic-media']

function postMatchesRule(post: PurgeCandidate, rule: PurgeRule, now: Date): boolean {
  const ageMs = now.getTime() - post.indexed_at.getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  if (ageHours < rule.afterHours) return false
  if (!rule.condition) return true
  const c = rule.condition
  // Boolean filters — if condition is set and post doesn't match, rule doesn't apply
  if (c.notInFeed && post.has_candidate) return false
  if (c.isOrphan && post.project_count > 0) return false
  if (c.postKind && post.post_kind !== c.postKind) return false
  if (c.hasMedia === true && !post.has_media) return false
  if (c.hasMedia === false && post.has_media) return false
  if (c.labeledNsfw && !post.labeled_nsfw) return false
  if (c.isTextOnly && !post.is_text_only) return false
  if (c.minEditorScore !== undefined && post.editor_score >= c.minEditorScore) return false
  // Engagement thresholds — post needs at least this many to survive
  const engagement = post.like_count + post.repost_count + post.reply_count + post.quote_count
  if (c.maxEngagement !== undefined && engagement >= c.maxEngagement) return false
  if (c.minLikes !== undefined && post.like_count >= c.minLikes) return false
  if (c.minReposts !== undefined && post.repost_count >= c.minReposts) return false
  if (c.minReplies !== undefined && post.reply_count >= c.minReplies) return false
  if (c.minQuotes !== undefined && post.quote_count >= c.minQuotes) return false
  return true
}

function isPurgeable(post: PurgeCandidate, policy: PurgePolicy, now: Date): boolean {
  for (const rule of policy.rules) {
    if (postMatchesRule(post, rule, now)) return true
  }
  return false
}

/**
 * Run a purge sweep using the global policy.
 * Deletes from ingested_posts — cascades handle feed_candidates, ingested_post_projects, post_engagement.
 */
export async function runPurgeSweep(
  pool: pg.Pool,
  options?: { dryRun?: boolean; batchSize?: number },
): Promise<PurgeSweepResult> {
  const dryRun = options?.dryRun ?? false
  const batchSize = options?.batchSize ?? 1000

  const settings = await getGlobalPurgeSettings(pool)
  if (!settings.enabled || settings.policy.rules.length === 0) {
    return { scanned: 0, purged: 0, dryRun }
  }

  const minHours = Math.min(...settings.policy.rules.map((r) => r.afterHours))
  const now = new Date()

  const PURGE_SELECT = `
    SELECT p.post_uri, p.indexed_at,
           COALESCE(e.like_count, 0)::int AS like_count,
           COALESCE(e.repost_count, 0)::int AS repost_count,
           COALESCE(e.reply_count, 0)::int AS reply_count,
           COALESCE(e.quote_count, 0)::int AS quote_count,
           EXISTS(SELECT 1 FROM feed_candidates fc WHERE fc.post_uri = p.post_uri) AS has_candidate,
           (SELECT count(*)::int FROM ingested_post_projects ipp WHERE ipp.post_uri = p.post_uri) AS project_count,
           COALESCE(p.summary_json->>'postKind', 'root') AS post_kind,
           COALESCE((p.summary_json->'embed'->>'hasImage')::boolean, false)
             OR COALESCE((p.summary_json->'embed'->>'hasVideo')::boolean, false) AS has_media,
           COALESCE((p.summary_json->'embed'->>'hasTextOnly')::boolean, false) AS is_text_only,
           EXISTS(
             SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.summary_json->'allLabelVals', '[]'::jsonb)) lv
             WHERE lv IN ('porn', 'sexual', 'nudity', 'graphic-media')
           ) AS labeled_nsfw,
           COALESCE((p.summary_json->>'editorScore')::float, 0)::float AS editor_score
    FROM ingested_posts p
    LEFT JOIN post_engagement e ON e.post_uri = p.post_uri`

  if (dryRun) {
    const res = await pool.query<PurgeCandidate>(
      `${PURGE_SELECT}
       WHERE p.indexed_at < NOW() - ($1::int * interval '1 hour')
       ORDER BY p.indexed_at ASC`,
      [minHours],
    )
    let wouldPurge = 0
    for (const row of res.rows) {
      if (isPurgeable(row, settings.policy, now)) wouldPurge++
    }
    return { scanned: res.rows.length, purged: wouldPurge, dryRun: true }
  }

  // Real run: loop in batches until no more eligible posts
  let totalScanned = 0
  let totalPurged = 0
  while (true) {
    const res = await pool.query<PurgeCandidate>(
      `${PURGE_SELECT}
       WHERE p.indexed_at < NOW() - ($1::int * interval '1 hour')
       ORDER BY p.indexed_at ASC
       LIMIT $2`,
      [minHours, batchSize],
    )
    if (res.rows.length === 0) break
    totalScanned += res.rows.length

    const toPurge: string[] = []
    for (const row of res.rows) {
      if (isPurgeable(row, settings.policy, now)) toPurge.push(row.post_uri)
    }
    if (toPurge.length > 0) {
      await pool.query(`DELETE FROM ingested_posts WHERE post_uri = ANY($1)`, [toPurge])
      totalPurged += toPurge.length
    }
    // If nothing was purgeable in this batch, remaining posts are keepers — stop
    if (toPurge.length === 0) break
  }

  return { scanned: totalScanned, purged: totalPurged, dryRun: false }
}
