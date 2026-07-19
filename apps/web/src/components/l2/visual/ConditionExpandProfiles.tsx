import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { COND_PROFILE_MAX } from '@cfb/l2-graph'
import type { ListMemberEntry } from '../../../api/client'
import {
  listMembersCached,
  resolveActorsCached,
} from '../actorResolveCache'

function profileUrl(member: ListMemberEntry): string {
  const actor = member.handle ?? member.did
  return `https://bsky.app/profile/${encodeURIComponent(actor)}`
}

function memberLabel(member: ListMemberEntry): string {
  if (member.displayName?.trim()) return member.displayName.trim()
  if (member.handle?.trim()) return `@${member.handle}`
  return member.did
}

function CompactProfileRow({ member }: { member: ListMemberEntry }) {
  const label = memberLabel(member)
  return (
    <a
      className="l2-flow-profile-row nodrag nopan"
      href={profileUrl(member)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open profile on Bluesky"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {member.avatarUrl ? (
        <img
          className="l2-flow-profile-avatar"
          src={member.avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="l2-flow-profile-avatar l2-flow-profile-avatar-fallback">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="l2-flow-profile-text">
        <span className="l2-flow-profile-name">{label}</span>
        {member.handle ? (
          <span className="l2-flow-profile-handle">@{member.handle}</span>
        ) : null}
      </span>
    </a>
  )
}

function stopNodeGesture(e: MouseEvent) {
  e.stopPropagation()
}

/** Resolve handles/DIDs (or an author list) into compact canvas profile rows. */
export function ConditionExpandProfiles({
  actors,
  listId,
  maxVisible = COND_PROFILE_MAX,
  showListMeta = true,
  hidePlusMore = false,
  onPlusMoreClick,
  plusMoreTitle = 'Open properties to see all',
}: {
  actors?: string[]
  listId?: string
  /** Cap visible rows (expand = 15, collapsed teaser = 3). */
  maxVisible?: number
  showListMeta?: boolean
  /** When parent already renders “+N more” from rule length. */
  hidePlusMore?: boolean
  /** Expanded: open properties. Collapsed teaser: expand the node. */
  onPlusMoreClick?: () => void
  plusMoreTitle?: string
}) {
  const refs = useMemo(
    () => [...new Set((actors ?? []).map((a) => a.trim().replace(/^@+/, '')).filter(Boolean))],
    [actors],
  )
  const [members, setMembers] = useState<ListMemberEntry[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (listId) {
      setLoading(true)
      setError(false)
      void listMembersCached(listId, { limit: maxVisible })
        .then((res) => {
          if (!cancelled) {
            setMembers(res.members)
            setMemberCount(res.memberCount)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMembers([])
            setMemberCount(0)
            setError(true)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    if (refs.length === 0) {
      setMembers([])
      setMemberCount(0)
      return
    }

    setLoading(true)
    setError(false)
    const timer = window.setTimeout(() => {
      void resolveActorsCached(refs)
        .then((list) => {
          if (!cancelled) {
            setMembers(list)
            setMemberCount(list.length)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMembers([])
            setMemberCount(0)
            setError(true)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 120)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [listId, refs.join('\n'), maxVisible])

  if (!listId && refs.length === 0) {
    return <span className="l2-flow-condition-body-empty">No accounts</span>
  }

  const visible = members.slice(0, maxVisible)
  const extra = Math.max(0, memberCount - visible.length)

  return (
    <div className="l2-flow-profile-list">
      {listId && showListMeta ? (
        <div className="l2-flow-condition-body-line l2-flow-profile-list-meta" title={listId}>
          list: {listId}
        </div>
      ) : null}
      {loading && members.length === 0 ? (
        <span className="l2-flow-condition-body-empty">Looking up…</span>
      ) : null}
      {error && members.length === 0 ? (
        <span className="l2-flow-condition-body-empty">Could not resolve</span>
      ) : null}
      {visible.map((member) => (
        <CompactProfileRow key={member.did} member={member} />
      ))}
      {!hidePlusMore && extra > 0 ? (
        onPlusMoreClick ? (
          <button
            type="button"
            className="l2-flow-condition-body-line l2-flow-profile-list-meta l2-flow-profile-more-btn nodrag nopan"
            title={plusMoreTitle}
            onMouseDown={stopNodeGesture}
            onClick={(e) => {
              stopNodeGesture(e)
              onPlusMoreClick()
            }}
          >
            +{extra} more
          </button>
        ) : (
          <div className="l2-flow-condition-body-line l2-flow-profile-list-meta">+{extra} more</div>
        )
      ) : null}
    </div>
  )
}

export const EXPAND_PROFILE_MAX = COND_PROFILE_MAX
