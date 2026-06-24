import type pg from 'pg'

export async function getLabelStreamCursor(pool: pg.Pool, labelerDid: string): Promise<number> {
  const res = await pool.query<{ cursor_seq: string }>(
    `SELECT cursor_seq FROM labeler_stream_cursors WHERE labeler_did = $1`,
    [labelerDid],
  )
  const raw = res.rows[0]?.cursor_seq
  if (raw === undefined || raw === null) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export async function saveLabelStreamCursor(
  pool: pg.Pool,
  labelerDid: string,
  seq: number,
): Promise<void> {
  if (!Number.isFinite(seq) || seq <= 0) return
  await pool.query(
    `INSERT INTO labeler_stream_cursors (labeler_did, cursor_seq, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (labeler_did) DO UPDATE
       SET cursor_seq = GREATEST(labeler_stream_cursors.cursor_seq, EXCLUDED.cursor_seq),
           updated_at = NOW()`,
    [labelerDid, seq],
  )
}
