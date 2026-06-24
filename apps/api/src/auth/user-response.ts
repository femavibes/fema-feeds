import type { AuthUser } from '@cfb/storage-postgres'

export function toAuthUser(user: {
  did: string
  handle?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}): AuthUser {
  return {
    did: user.did,
    handle: user.handle ?? null,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  }
}
