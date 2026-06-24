#!/usr/bin/env node
/**
 * Apply SQL migrations using DATABASE_URL from .env (repo root).
 * Tries postgres superuser on native Windows when the app user lacks ALTER privileges.
 *
 * Usage:
 *   node database/run-migration.mjs database/migrations/003_labelers.sql
 *   node database/run-migration.mjs --all
 */
import { readFileSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'database/migrations')

function loadEnvValue(key) {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      if (trimmed.slice(0, eq).trim() !== key) continue
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      return val
    }
  } catch {
    /* no .env */
  }
  return process.env[key]
}

function candidateUrls(appUrl) {
  const urls = []
  const migrationUrl = loadEnvValue('MIGRATION_DATABASE_URL')
  if (migrationUrl) urls.push(migrationUrl)

  try {
    const u = new URL(appUrl)
    const db = u.pathname.replace(/^\//, '') || 'custom_feed_builder'
    const host = u.hostname || 'localhost'
    const port = u.port || '5432'
    const pgPassword = loadEnvValue('POSTGRES_PASSWORD') || u.password || 'cfb_dev'

    if (u.username && u.username !== 'postgres') {
      urls.push(
        `postgresql://postgres:${encodeURIComponent(pgPassword)}@${host}:${port}/${db}`,
      )
    }
    urls.push(appUrl)
  } catch {
    urls.push(appUrl)
  }

  return [...new Set(urls)]
}

async function applySql(url, sql, label) {
  const pool = new pg.Pool({ connectionString: url })
  try {
    await pool.query(sql)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  failed (${new URL(url).username}@…): ${msg}`)
    return false
  } finally {
    await pool.end()
  }
}

async function runFile(sqlPath) {
  const abs = resolve(root, sqlPath)
  const sql = await readFile(abs, 'utf8')
  const appUrl = loadEnvValue('DATABASE_URL')
  if (!appUrl) throw new Error('DATABASE_URL not set in .env')

  console.log(`Applying ${sqlPath}…`)
  for (const url of candidateUrls(appUrl)) {
    const user = new URL(url).username
    console.log(`  trying ${user}…`)
    if (await applySql(url, sql, sqlPath)) {
      console.log(`Applied: ${sqlPath} (as ${user})`)
      return
    }
  }
  throw new Error(`Migration failed for all connection attempts: ${sqlPath}`)
}

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join('database/migrations', f))
}

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node database/run-migration.mjs <file.sql> | --all')
  process.exit(1)
}

try {
  if (arg === '--all') {
    for (const file of listMigrations()) {
      await runFile(file)
    }
    console.log('All migrations applied.')
  } else {
    await runFile(arg)
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
