import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Pool } from '@cfb/storage-postgres'
import { getIngestSettings, saveIngestSettings } from '@cfb/storage-postgres'

const FILE_NAME = 'ingest-desired.json'

async function readFileState(stateDir: string): Promise<boolean> {
  try {
    const raw = await readFile(resolve(stateDir, FILE_NAME), 'utf8')
    const parsed = JSON.parse(raw) as { desiredRunning?: boolean }
    return parsed.desiredRunning === true
  } catch {
    return false
  }
}

async function writeFileState(stateDir: string, desiredRunning: boolean): Promise<void> {
  await mkdir(stateDir, { recursive: true })
  await writeFile(
    resolve(stateDir, FILE_NAME),
    `${JSON.stringify({ desiredRunning }, null, 2)}\n`,
    'utf8',
  )
}

/** Operator intent for Jetstream ingest — persisted across API/Docker restarts. */
export async function getIngestDesiredRunning(
  pool: Pool | null | undefined,
  stateDir: string,
): Promise<boolean> {
  if (pool) {
    const settings = await getIngestSettings(pool)
    return settings.desiredRunning
  }
  return readFileState(stateDir)
}

export async function setIngestDesiredRunning(
  pool: Pool | null | undefined,
  stateDir: string,
  desiredRunning: boolean,
): Promise<void> {
  if (pool) {
    await saveIngestSettings(pool, { desiredRunning })
    return
  }
  await writeFileState(stateDir, desiredRunning)
}
