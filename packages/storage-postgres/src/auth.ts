import type pg from 'pg'

export interface UserRow {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  createdAt: Date
  lastLoginAt: Date
}

export interface AuthUser {
  did: string
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
}

export async function upsertUser(
  pool: pg.Pool,
  user: {
    did: string
    handle?: string | null
    displayName?: string | null
    avatarUrl?: string | null
  },
): Promise<UserRow> {
  const res = await pool.query<UserRow>(
    `INSERT INTO users (did, handle, display_name, avatar_url, last_login_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (did) DO UPDATE SET
       handle = COALESCE(EXCLUDED.handle, users.handle),
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       last_login_at = NOW()
     RETURNING did, handle, display_name as "displayName", avatar_url as "avatarUrl",
               created_at as "createdAt", last_login_at as "lastLoginAt"`,
    [user.did, user.handle ?? null, user.displayName ?? null, user.avatarUrl ?? null],
  )
  return res.rows[0]!
}

export async function getUser(pool: pg.Pool, did: string): Promise<AuthUser | null> {
  const res = await pool.query<AuthUser>(
    `SELECT did, handle, display_name as "displayName", avatar_url as "avatarUrl"
     FROM users WHERE did = $1`,
    [did],
  )
  return res.rows[0] ?? null
}

export async function createBrowserSession(
  pool: pg.Pool,
  sessionId: string,
  userDid: string,
  expiresAt: Date,
): Promise<void> {
  await pool.query(
    `INSERT INTO browser_sessions (id, user_did, expires_at) VALUES ($1, $2, $3)`,
    [sessionId, userDid, expiresAt],
  )
}

export async function getBrowserSessionUserDid(
  pool: pg.Pool,
  sessionId: string,
): Promise<string | null> {
  const res = await pool.query<{ user_did: string }>(
    `SELECT user_did FROM browser_sessions
     WHERE id = $1 AND expires_at > NOW()`,
    [sessionId],
  )
  return res.rows[0]?.user_did ?? null
}

export async function deleteBrowserSession(pool: pg.Pool, sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM browser_sessions WHERE id = $1`, [sessionId])
}

export async function pruneExpiredBrowserSessions(pool: pg.Pool): Promise<void> {
  await pool.query(`DELETE FROM browser_sessions WHERE expires_at <= NOW()`)
}

export async function saveOAuthSession(
  pool: pg.Pool,
  userDid: string,
  sessionJson: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO oauth_sessions (user_did, session_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_did) DO UPDATE SET session_json = EXCLUDED.session_json, updated_at = NOW()`,
    [userDid, JSON.stringify(sessionJson)],
  )
}

export async function getOAuthSessionJson(
  pool: pg.Pool,
  userDid: string,
): Promise<unknown | undefined> {
  const res = await pool.query<{ session_json: unknown }>(
    `SELECT session_json FROM oauth_sessions WHERE user_did = $1`,
    [userDid],
  )
  return res.rows[0]?.session_json
}

export async function deleteOAuthSession(pool: pg.Pool, userDid: string): Promise<void> {
  await pool.query(`DELETE FROM oauth_sessions WHERE user_did = $1`, [userDid])
}

export async function setOAuthState(
  pool: pg.Pool,
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs)
  await pool.query(
    `INSERT INTO oauth_state (state_key, value_json, expires_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (state_key) DO UPDATE SET value_json = EXCLUDED.value_json, expires_at = EXCLUDED.expires_at`,
    [key, JSON.stringify(value), expiresAt],
  )
}

export async function getOAuthState(
  pool: pg.Pool,
  key: string,
): Promise<unknown | undefined> {
  const res = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM oauth_state WHERE state_key = $1 AND expires_at > NOW()`,
    [key],
  )
  return res.rows[0]?.value_json
}

export async function deleteOAuthState(pool: pg.Pool, key: string): Promise<void> {
  await pool.query(`DELETE FROM oauth_state WHERE state_key = $1`, [key])
}

export async function pruneExpiredOAuthState(pool: pg.Pool): Promise<void> {
  await pool.query(`DELETE FROM oauth_state WHERE expires_at <= NOW()`)
}
