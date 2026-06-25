import { useEffect, useState } from 'react'

import type { ListMemberEntry } from '../api/client'
import { api } from '../api/client'

const profileCache = new Map<string, ListMemberEntry>()
const pendingDids = new Set<string>()
let batchTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emptyProfile(did: string): ListMemberEntry {
  return { did, handle: null, displayName: null, avatarUrl: null }
}

function notifyListeners() {
  for (const listener of listeners) listener()
}

function flushBatch() {
  batchTimer = null
  const missing = [...pendingDids].filter((did) => !profileCache.has(did))
  pendingDids.clear()
  if (missing.length === 0) {
    notifyListeners()
    return
  }
  void api
    .resolveAuthorProfiles(missing)
    .then((res) => {
      for (const member of res.members) {
        profileCache.set(member.did, member)
      }
      for (const did of missing) {
        if (!profileCache.has(did)) profileCache.set(did, emptyProfile(did))
      }
    })
    .catch(() => {
      for (const did of missing) {
        if (!profileCache.has(did)) profileCache.set(did, emptyProfile(did))
      }
    })
    .finally(notifyListeners)
}

function scheduleBatch(did: string) {
  if (!profileCache.has(did)) pendingDids.add(did)
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, 40)
  }
}

export function usePublisherProfile(did: string | null | undefined): ListMemberEntry | null {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!did) return undefined
    scheduleBatch(did)
    const listener = () => tick((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [did])

  if (!did) return null
  return profileCache.get(did) ?? null
}
