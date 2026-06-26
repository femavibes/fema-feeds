import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(resolve(root, 'database/init.sql'), 'utf8')
const url = process.env.DATABASE_URL
if (!url) { console.log('[init-schema] No DATABASE_URL, skipping'); process.exit(0) }

const pool = new pg.Pool({ connectionString: url })
try {
  await pool.query(sql)
  console.log('[init-schema] Base schema applied')
} catch (e) {
  console.log('[init-schema] Note:', e.message)
} finally {
  await pool.end()
}
