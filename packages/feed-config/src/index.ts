import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FeedConfig } from '@cfb/core-types'

export const DEFAULT_FEEDS_DIR = 'config/feeds'

export function feedConfigPath(feedsDir: string, feedId: string): string {
  return resolve(feedsDir, `${feedId}.json`)
}

export async function loadFeed(feedsDir: string, feedId: string): Promise<FeedConfig> {
  const raw = await readFile(feedConfigPath(feedsDir, feedId), 'utf8')
  return JSON.parse(raw) as FeedConfig
}

export async function loadAllFeeds(feedsDir: string): Promise<FeedConfig[]> {
  let files: string[]
  try {
    files = (await readdir(feedsDir)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const feeds: FeedConfig[] = []
  for (const file of files) {
    const raw = await readFile(resolve(feedsDir, file), 'utf8')
    feeds.push(JSON.parse(raw) as FeedConfig)
  }
  return feeds
}

export async function loadFeedsForProject(
  feedsDir: string,
  projectId: string,
): Promise<FeedConfig[]> {
  const all = await loadAllFeeds(feedsDir)
  return all.filter((f) => f.projectId === projectId)
}

export async function saveFeed(feedsDir: string, config: FeedConfig): Promise<void> {
  await mkdir(feedsDir, { recursive: true })
  await writeFile(
    feedConfigPath(feedsDir, config.feedId),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8',
  )
}

export async function deleteFeed(feedsDir: string, feedId: string): Promise<void> {
  await unlink(feedConfigPath(feedsDir, feedId))
}
