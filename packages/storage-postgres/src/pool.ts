import pg from 'pg'

const { Pool } = pg

export function createPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required for Postgres storage')
  }
  return new Pool({ connectionString: url })
}
