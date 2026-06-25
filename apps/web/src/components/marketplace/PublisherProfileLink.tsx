import type { MouseEvent } from 'react'

import { blueskyProfileUrl } from '../../lib/bsky-url'
import { usePublisherProfile } from '../../hooks/usePublisherProfiles'

interface Props {
  did: string
  size?: 'sm' | 'md'
  stopPropagation?: boolean
  className?: string
}

function avatarInitial(displayName: string | null, handle: string | null, did: string): string {
  const source = displayName?.trim() || handle || did
  return source.replace(/^@/, '').charAt(0).toUpperCase() || '?'
}

function primaryLabel(
  displayName: string | null,
  handle: string | null,
  did: string,
  loading: boolean,
): string {
  if (displayName?.trim()) return displayName.trim()
  if (handle?.trim()) return `@${handle}`
  if (loading) return 'Loading publisher…'
  return `${did.slice(0, 16)}…`
}

function secondaryLabel(displayName: string | null, handle: string | null): string | null {
  if (displayName?.trim() && handle?.trim()) return `@${handle}`
  return null
}

export function PublisherProfileLink({
  did,
  size = 'sm',
  stopPropagation = false,
  className,
}: Props) {
  const profile = usePublisherProfile(did)
  const loading = profile === null
  const handle = profile?.handle ?? null
  const displayName = profile?.displayName ?? null
  const avatarUrl = profile?.avatarUrl ?? null

  const onClick = stopPropagation
    ? (e: MouseEvent) => {
        e.stopPropagation()
      }
    : undefined

  return (
    <a
      href={blueskyProfileUrl({ did, handle })}
      target="_blank"
      rel="noopener noreferrer"
      className={`publisher-profile-link publisher-profile-link--${size}${className ? ` ${className}` : ''}`}
      title="Open publisher on Bluesky"
      onClick={onClick}
    >
      {avatarUrl ? (
        <img
          className="publisher-profile-avatar"
          src={avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="publisher-profile-avatar publisher-profile-avatar-fallback" aria-hidden>
          {avatarInitial(displayName, handle, did)}
        </span>
      )}
      <span className="publisher-profile-text">
        <span className="publisher-profile-name">{primaryLabel(displayName, handle, did, loading)}</span>
        {secondaryLabel(displayName, handle) ? (
          <span className="publisher-profile-handle mono">{secondaryLabel(displayName, handle)}</span>
        ) : null}
      </span>
    </a>
  )
}
