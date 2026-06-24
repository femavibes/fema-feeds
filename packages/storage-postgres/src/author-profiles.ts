import type { AuthorProfile } from '@cfb/core-types'
import type pg from 'pg'

export interface AuthorProfileRow extends AuthorProfile {
  fetchedAt: Date
  expiresAt: Date | null
}

function rowFromDb(r: pg.QueryResultRow): AuthorProfileRow {
  const labels = r.labels_json as unknown
  return {
    did: r.did as string,
    handle: (r.handle as string | null) ?? null,
    displayName: (r.display_name as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    avatarUrl: (r.avatar_url as string | null) ?? null,
    bannerUrl: (r.banner_url as string | null) ?? null,
    accountCreatedAt: r.account_created_at
      ? new Date(r.account_created_at as string).toISOString()
      : null,
    indexedAt: r.indexed_at ? new Date(r.indexed_at as string).toISOString() : null,
    followersCount: Number(r.followers_count),
    followsCount: Number(r.follows_count),
    postsCount: Number(r.posts_count),
    labels: Array.isArray(labels) ? labels.map(String) : [],
    fetchedAt: new Date(r.fetched_at as string),
    expiresAt: r.expires_at ? new Date(r.expires_at as string) : null,
  }
}

export async function getAuthorProfile(
  pool: pg.Pool,
  did: string,
): Promise<AuthorProfileRow | null> {
  const res = await pool.query(
    `SELECT did, handle, display_name, description, avatar_url, banner_url,
            account_created_at, indexed_at, followers_count, follows_count, posts_count,
            labels_json, fetched_at, expires_at
     FROM author_profiles WHERE did = $1`,
    [did],
  )
  const row = res.rows[0]
  return row ? rowFromDb(row) : null
}

export async function getAuthorProfilesByDids(
  pool: pg.Pool,
  dids: string[],
): Promise<AuthorProfileRow[]> {
  if (dids.length === 0) return []
  const res = await pool.query(
    `SELECT did, handle, display_name, description, avatar_url, banner_url,
            account_created_at, indexed_at, followers_count, follows_count, posts_count,
            labels_json, fetched_at, expires_at
     FROM author_profiles
     WHERE did = ANY($1::text[])`,
    [dids],
  )
  return res.rows.map(rowFromDb)
}

export async function upsertAuthorProfile(
  pool: pg.Pool,
  profile: AuthorProfile,
  ttlHours: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000)
  await pool.query(
    `INSERT INTO author_profiles (
       did, handle, display_name, description, avatar_url, banner_url,
       account_created_at, indexed_at, followers_count, follows_count, posts_count,
       labels_json, fetched_at, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW(), $13)
     ON CONFLICT (did) DO UPDATE SET
       handle = EXCLUDED.handle,
       display_name = EXCLUDED.display_name,
       description = EXCLUDED.description,
       avatar_url = EXCLUDED.avatar_url,
       banner_url = EXCLUDED.banner_url,
       account_created_at = COALESCE(EXCLUDED.account_created_at, author_profiles.account_created_at),
       indexed_at = EXCLUDED.indexed_at,
       followers_count = EXCLUDED.followers_count,
       follows_count = EXCLUDED.follows_count,
       posts_count = EXCLUDED.posts_count,
       labels_json = EXCLUDED.labels_json,
       fetched_at = NOW(),
       expires_at = EXCLUDED.expires_at`,
    [
      profile.did,
      profile.handle ?? null,
      profile.displayName ?? null,
      profile.description ?? null,
      profile.avatarUrl ?? null,
      profile.bannerUrl ?? null,
      profile.accountCreatedAt ?? null,
      profile.indexedAt ?? null,
      profile.followersCount,
      profile.followsCount,
      profile.postsCount,
      JSON.stringify(profile.labels),
      expiresAt,
    ],
  )
}

export async function isAuthorProfileFresh(
  pool: pg.Pool,
  did: string,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM author_profiles
     WHERE did = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
    [did],
  )
  return res.rowCount !== null && res.rowCount > 0
}

export async function pruneExpiredAuthorProfiles(pool: pg.Pool): Promise<number> {
  const res = await pool.query(
    `DELETE FROM author_profiles
     WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 day'`,
  )
  return res.rowCount ?? 0
}
