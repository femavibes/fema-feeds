import { startListitemJetstream, type ListitemEvent } from '@cfb/ingest-jetstream'
import type pg from 'pg'
import {
  addAuthorListMember,
  listDistinctOwnerDidsForLists,
  removeAuthorListMember,
  takeListitemIndex,
  upsertListitemIndex,
} from '@cfb/storage-postgres'

export interface ListitemStreamStats {
  events: number
  creates: number
  deletes: number
  applied: number
  ignored: number
  errors: number
  ownerCount: number
}

export interface ListitemStreamManagerOptions {
  pool: pg.Pool
  jetstreamUrl?: string
  ownerReloadMs?: number
}

export interface ListitemStreamManager {
  start: () => Promise<void>
  stop: () => void
  getStats: () => ListitemStreamStats
}

function sameDidSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((d) => set.has(d))
}

export function createListitemStreamManager(
  options: ListitemStreamManagerOptions,
): ListitemStreamManager {
  const ownerReloadMs = options.ownerReloadMs ?? 60_000
  let running = false
  let ownerTimer: ReturnType<typeof setInterval> | null = null
  let stream: Awaited<ReturnType<typeof startListitemJetstream>> | null = null
  let owners: string[] = []

  const stats: ListitemStreamStats = {
    events: 0,
    creates: 0,
    deletes: 0,
    applied: 0,
    ignored: 0,
    errors: 0,
    ownerCount: 0,
  }

  async function handleEvent(event: ListitemEvent): Promise<void> {
    stats.events++
    try {
      if (event.operation === 'create') {
        stats.creates++
        if (!event.listUri || !event.subjectDid) {
          stats.ignored++
          return
        }
        await upsertListitemIndex(options.pool, {
          listitemUri: event.listitemUri,
          listUri: event.listUri,
          subjectDid: event.subjectDid,
        })
        const ok = await addAuthorListMember(options.pool, event.listUri, event.subjectDid)
        if (ok) stats.applied++
        else stats.ignored++
        return
      }

      stats.deletes++
      const indexed = await takeListitemIndex(options.pool, event.listitemUri)
      if (!indexed) {
        stats.ignored++
        return
      }
      const ok = await removeAuthorListMember(options.pool, indexed.listUri, indexed.subjectDid)
      if (ok) stats.applied++
      else stats.ignored++
    } catch (err) {
      stats.errors++
      console.warn('[listitem-stream] event failed:', err)
    }
  }

  async function reloadOwners(): Promise<void> {
    const next = await listDistinctOwnerDidsForLists(options.pool)
    stats.ownerCount = next.length
    if (sameDidSet(owners, next)) return
    owners = next
    if (!stream) return
    if (owners.length === 0) {
      stream.updateWantedDids([])
      return
    }
    stream.updateWantedDids(owners)
  }

  return {
    async start() {
      if (running) return
      running = true
      owners = await listDistinctOwnerDidsForLists(options.pool)
      stats.ownerCount = owners.length

      stream = await startListitemJetstream({
        jetstreamUrl: options.jetstreamUrl,
        wantedDids: owners.length ? owners : undefined,
        onListitem: (event) => {
          void handleEvent(event)
        },
        onError: (err) => {
          stats.errors++
          console.warn('[listitem-stream] jetstream error:', err)
        },
      })

      ownerTimer = setInterval(() => {
        void reloadOwners()
      }, ownerReloadMs)
    },
    stop() {
      running = false
      if (ownerTimer) clearInterval(ownerTimer)
      ownerTimer = null
      stream?.stop()
      stream = null
    },
    getStats: () => ({ ...stats }),
  }
}
