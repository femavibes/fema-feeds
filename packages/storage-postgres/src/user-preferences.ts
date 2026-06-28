import type pg from 'pg'

export interface UserPreferences {
  blurNsfw?: boolean
}

export async function getUserPreferences(
  pool: pg.Pool,
  userDid: string,
): Promise<UserPreferences> {
  const res = await pool.query<{ value_json: UserPreferences }>(
    `SELECT value_json FROM user_settings WHERE owner_did = $1 AND key = 'preferences'`,
    [userDid],
  )
  return res.rows[0]?.value_json ?? {}
}

export async function saveUserPreferences(
  pool: pg.Pool,
  userDid: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  await pool.query(
    `INSERT INTO user_settings (owner_did, key, value_json, updated_at)
     VALUES ($1, 'preferences', $2::jsonb, NOW())
     ON CONFLICT (owner_did, key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [userDid, JSON.stringify(prefs)],
  )
  return prefs
}
