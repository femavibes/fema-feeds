import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'

const KEY_PREFIX = 'whi_'

export function generateFeedApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString('base64url')
  const raw = `${KEY_PREFIX}${secret}`
  const hash = hashFeedApiKey(raw)
  return { raw, prefix: raw.slice(0, 12), hash }
}

export function hashFeedApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export type FeedApiKeyRow = {
  id: string
  feedId: string
  ownerDid: string
  label: string
  keyPrefix: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

function mapRow(r: Record<string, unknown>): FeedApiKeyRow {
  return {
    id: String(r.id),
    feedId: String(r.feed_id),
    ownerDid: String(r.owner_did),
    label: String(r.label ?? ''),
    keyPrefix: String(r.key_prefix),
    createdAt: new Date(String(r.created_at)).toISOString(),
    revokedAt: r.revoked_at ? new Date(String(r.revoked_at)).toISOString() : null,
    lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).toISOString() : null,
  }
}

export async function createFeedApiKey(
  pool: pg.Pool,
  input: { feedId: string; ownerDid: string; label?: string },
): Promise<{ row: FeedApiKeyRow; rawKey: string }> {
  const { raw, prefix, hash } = generateFeedApiKey()
  const res = await pool.query(
    `INSERT INTO feed_api_keys (feed_id, owner_did, label, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.feedId, input.ownerDid, input.label ?? '', prefix, hash],
  )
  return { row: mapRow(res.rows[0] as Record<string, unknown>), rawKey: raw }
}

export async function listFeedApiKeys(
  pool: pg.Pool,
  feedId: string,
): Promise<FeedApiKeyRow[]> {
  const res = await pool.query(
    `SELECT * FROM feed_api_keys WHERE feed_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [feedId],
  )
  return res.rows.map((r) => mapRow(r as Record<string, unknown>))
}

export async function revokeFeedApiKey(
  pool: pg.Pool,
  feedId: string,
  keyId: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE feed_api_keys SET revoked_at = NOW() WHERE feed_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [feedId, keyId],
  )
  return (res.rowCount ?? 0) > 0
}

export async function resolveFeedApiKey(
  pool: pg.Pool,
  rawKey: string,
): Promise<{ feedId: string; ownerDid: string; keyId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null
  const hash = hashFeedApiKey(rawKey)
  const res = await pool.query(
    `UPDATE feed_api_keys SET last_used_at = NOW()
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING id, feed_id, owner_did`,
    [hash],
  )
  const row = res.rows[0] as { id: string; feed_id: string; owner_did: string } | undefined
  if (!row) return null
  return { feedId: row.feed_id, ownerDid: row.owner_did, keyId: row.id }
}
