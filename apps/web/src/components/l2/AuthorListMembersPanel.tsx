import { useState } from 'react'
import { api, type ListCacheEntry, type ListMemberEntry } from '../../api/client'

interface Props {
  listId?: string
  extraDids?: string[]
  manualDids?: string[]
  cache?: ListCacheEntry
  onRefreshList?: (listId: string) => Promise<void>
}

function profileUrl(member: ListMemberEntry): string {
  const actor = member.handle ?? member.did
  return `https://bsky.app/profile/${encodeURIComponent(actor)}`
}

function memberPrimaryLabel(member: ListMemberEntry): string {
  if (member.displayName?.trim()) return member.displayName.trim()
  if (member.handle?.trim()) return `@${member.handle}`
  return member.did
}

function memberSecondaryLabel(member: ListMemberEntry): string | null {
  if (member.displayName?.trim() && member.handle) return `@${member.handle}`
  if (member.handle) return member.did
  return null
}

function avatarInitial(member: ListMemberEntry): string {
  const source = member.displayName?.trim() || member.handle || member.did
  return source.replace(/^@/, '').charAt(0).toUpperCase() || '?'
}

export function AuthorListMembersPanel({
  listId,
  extraDids = [],
  manualDids,
  cache,
  onRefreshList,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<ListMemberEntry[] | null>(null)
  const [graphName, setGraphName] = useState<string | null>(cache?.graphName ?? null)

  const manualOnly = !listId && (manualDids?.length ?? 0) > 0
  const memberCount = manualOnly ? (manualDids?.length ?? 0) : (cache?.memberCount ?? 0)

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      if (listId) {
        const res = await api.listMembers(listId, extraDids)
        setMembers(res.members)
        setGraphName(res.graphName)
      } else if (manualDids?.length) {
        const res = await api.resolveAuthorProfiles(manualDids)
        setMembers(res.members)
      } else {
        setMembers([])
      }
      setOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  if (!listId && !manualOnly) return null

  const title = graphName ?? cache?.listId ?? listId ?? 'Author list'

  return (
    <div className="l2-author-list-members card">
      <div className="l2-author-list-members-meta">
        <strong>{title}</strong>
        {graphName && listId && cache?.listId && graphName !== cache.listId ? (
          <span className="l2-author-list-members-id mono"> ({cache.listId})</span>
        ) : null}
        <p className="l2-condition-hint">
          {memberCount} member{memberCount === 1 ? '' : 's'}
          {extraDids.length > 0 ? ` + ${extraDids.length} extra on this condition` : ''}
          {cache?.refreshedAt
            ? ` · cached ${new Date(cache.refreshedAt).toLocaleString()}`
            : ''}
        </p>
      </div>

      <div className="l2-author-list-members-actions">
        {listId && onRefreshList ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={loading}
            onClick={() => void onRefreshList(listId).then(() => loadMembers())}
          >
            Refresh list
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={loading || memberCount === 0}
          onClick={() => void (open && members ? setOpen(false) : loadMembers())}
        >
          {loading ? 'Loading…' : open && members ? 'Hide members' : 'View members'}
        </button>
      </div>

      {error ? <p className="field-error">{error}</p> : null}

      {open && members ? (
        <ul className="l2-author-list-members-list">
          {members.map((member) => (
            <li key={member.did}>
              <a
                className="l2-author-list-member-row"
                href={profileUrl(member)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${member.handle ? `@${member.handle}` : member.did} on Bluesky`}
              >
                {member.avatarUrl ? (
                  <img
                    className="l2-author-list-member-avatar"
                    src={member.avatarUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="l2-author-list-member-avatar l2-author-list-member-avatar-fallback">
                    {avatarInitial(member)}
                  </span>
                )}
                <span className="l2-author-list-member-text">
                  <span className="l2-author-list-member-name">{memberPrimaryLabel(member)}</span>
                  {memberSecondaryLabel(member) ? (
                    <span className="l2-author-list-member-sub mono">
                      {memberSecondaryLabel(member)}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
