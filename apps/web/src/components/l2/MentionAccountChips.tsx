import { useEffect, useMemo, useState } from 'react'
import { api, type ListMemberEntry } from '../../api/client'

interface Props {
  accounts: string[]
}

function profileUrl(member: ListMemberEntry): string {
  const actor = member.handle ?? member.did
  return `https://bsky.app/profile/${encodeURIComponent(actor)}`
}

function memberLabel(member: ListMemberEntry): string {
  if (member.displayName?.trim()) return member.displayName.trim()
  if (member.handle?.trim()) return `@${member.handle}`
  return member.did
}

export function MentionAccountChips({ accounts: accountsProp }: Props) {
  const accounts = accountsProp ?? []
  const refs = useMemo(
    () => [...new Set(accounts.map((a) => a.trim().replace(/^@+/, '')).filter(Boolean))],
    [accounts],
  )
  const [members, setMembers] = useState<ListMemberEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (refs.length === 0) {
      setMembers([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      void api
        .resolveActors(refs)
        .then((res) => {
          if (!cancelled) setMembers(res.members)
        })
        .catch(() => {
          if (!cancelled) setMembers([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [refs.join('\n')])

  if (refs.length === 0) return null

  return (
    <div className="mention-account-chips">
      <div className="mention-account-chips-head">
        <span className="mention-account-chips-label">Resolved accounts</span>
        {loading ? <span className="mention-account-chips-status">Looking up…</span> : null}
      </div>
      {members.length > 0 ? (
        <div className="mention-account-chips-list">
          {members.map((member) => (
            <a
              key={member.did}
              className="author-did-resolved mention-account-chip"
              href={profileUrl(member)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open profile on Bluesky"
            >
              {member.avatarUrl ? (
                <img
                  className="author-did-resolved-avatar"
                  src={member.avatarUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="author-did-resolved-avatar author-did-resolved-avatar-fallback">
                  {memberLabel(member).charAt(0).toUpperCase()}
                </span>
              )}
              <span className="author-did-resolved-text">
                <span className="author-did-resolved-name">{memberLabel(member)}</span>
                {member.handle ? (
                  <span className="author-did-resolved-handle mono">@{member.handle}</span>
                ) : null}
              </span>
            </a>
          ))}
        </div>
      ) : !loading ? (
        <p className="l2-condition-hint">Could not resolve accounts — check handles or DIDs.</p>
      ) : null}
    </div>
  )
}
