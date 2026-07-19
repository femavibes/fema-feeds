import { useEffect, useState } from 'react'
import type { ListCacheEntry, ListMemberEntry } from '../../api/client'
import { bskyWebHref, atProtoUriToBskyWebUrl } from '../../lib/bsky-web-url'
import {
  invalidateListMembersCache,
  LIST_MEMBERS_PREVIEW_LIMIT,
  listMembersCached,
  peekListGraphNameCached,
} from './actorResolveCache'

interface Props {
  listId: string
  /** Bluesky list / starter-pack URL for copy + open actions. */
  uri?: string
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

function formatCooldown(ms: number): string {
  const sec = Math.ceil(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.ceil(sec / 60)
  if (min < 60) return `${min}m`
  return `${Math.ceil(min / 60)}h`
}

function formatCount(n: number): string {
  return n.toLocaleString()
}

function IconCopy() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M5.5 2A1.5 1.5 0 0 0 4 3.5v8A1.5 1.5 0 0 0 5.5 13h6A1.5 1.5 0 0 0 13 11.5v-8A1.5 1.5 0 0 0 11.5 2h-6ZM5 3.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-8Z" />
      <path d="M2.5 5A1.5 1.5 0 0 0 1 6.5v8A1.5 1.5 0 0 0 2.5 16h6A1.5 1.5 0 0 0 10 14.5V14H9v.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H3V5H2.5Z" />
    </svg>
  )
}

function IconExternal() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M6.5 3a.5.5 0 0 0 0 1H11.3L3.15 12.15a.5.5 0 1 0 .7.7L12 4.71V9.5a.5.5 0 0 0 1 0v-6A.5.5 0 0 0 12.5 3h-6Z" />
    </svg>
  )
}

/** Bluesky author list members — preview page only (mega-lists stay summary + sample). */
export function AuthorListMembersPanel({ listId, uri, cache, onRefreshList }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<ListMemberEntry[] | null>(null)
  const [memberCount, setMemberCount] = useState(() => cache?.memberCount ?? 0)
  const [truncated, setTruncated] = useState(false)
  const [graphName, setGraphName] = useState<string | null>(
    () => cache?.graphName ?? peekListGraphNameCached(listId) ?? null,
  )
  const [copied, setCopied] = useState(false)
  const [cooldownMs, setCooldownMs] = useState(() => cache?.refreshCooldownRemainingMs ?? 0)

  useEffect(() => {
    const remaining = cache?.refreshCooldownRemainingMs ?? 0
    if (remaining <= 0) {
      setCooldownMs(0)
      return
    }
    const endsAt = Date.now() + remaining
    setCooldownMs(remaining)
    const id = window.setInterval(() => {
      setCooldownMs(Math.max(0, endsAt - Date.now()))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cache?.refreshCooldownRemainingMs, cache?.lastManualRefreshAt, listId])

  const loadMembers = async (opts?: { bust?: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      if (opts?.bust) invalidateListMembersCache(listId)
      const next = await listMembersCached(listId, { limit: LIST_MEMBERS_PREVIEW_LIMIT })
      setMembers(next.members)
      setMemberCount(next.memberCount || cache?.memberCount || 0)
      setTruncated(Boolean(next.truncated) || next.memberCount > next.members.length)
      const name =
        next.graphName?.trim() ||
        peekListGraphNameCached(listId) ||
        cache?.graphName?.trim() ||
        null
      if (name) setGraphName(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when list changes
  }, [listId])

  useEffect(() => {
    if (cache?.graphName?.trim()) setGraphName(cache.graphName.trim())
    if (cache?.memberCount != null) setMemberCount(cache.memberCount)
  }, [cache?.graphName, cache?.memberCount])

  const title = graphName?.trim() || cache?.graphName?.trim() || listId || 'Author list'
  const typeLabel =
    cache?.listTypeLabel?.trim() ||
    (cache?.listKind === 'starterpack'
      ? 'Starter pack'
      : cache?.listPurpose === 'modlist'
        ? 'Moderation list'
        : cache?.listPurpose === 'curatelist'
          ? 'Curation list'
          : null)

  const copyUri = async () => {
    if (!uri) return
    // Copy a browser-openable URL when we can; keep at:// only if conversion fails.
    const text = atProtoUriToBskyWebUrl(uri) ?? uri
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const handleRefresh = async () => {
    if (!onRefreshList || cooldownMs > 0) return
    setLoading(true)
    setError(null)
    try {
      await onRefreshList(listId)
      await loadMembers({ bust: true })
    } catch (e) {
      const err = e as Error & { cooldownRemainingMs?: number }
      if (err.cooldownRemainingMs != null) setCooldownMs(err.cooldownRemainingMs)
      setError(err.message || 'Refresh failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="l2-author-list-members card">
      <div className="l2-author-list-members-meta">
        <div className="l2-author-list-members-title-row">
          <strong className="l2-author-list-members-title">{title}</strong>
          {uri ? (
            <span className="l2-author-list-members-title-actions">
              <button
                type="button"
                className="l2-author-list-icon-btn"
                onClick={() => void copyUri()}
                title={copied ? 'Copied' : 'Copy list URL'}
                aria-label={copied ? 'Copied' : 'Copy list URL'}
              >
                <IconCopy />
              </button>
              <a
                className="l2-author-list-icon-btn"
                href={bskyWebHref(uri)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open list on Bluesky"
                aria-label="Open list on Bluesky"
              >
                <IconExternal />
              </a>
            </span>
          ) : null}
        </div>
        <p className="l2-condition-hint">
          {typeLabel ? <span className="l2-author-list-type-badge">{typeLabel}</span> : null}
          {typeLabel ? ' · ' : ''}
          {loading && !members
            ? 'Loading sample…'
            : `${formatCount(memberCount)} member${memberCount === 1 ? '' : 's'}`}
          {cache?.refreshedAt
            ? ` · cached ${new Date(cache.refreshedAt).toLocaleString()}`
            : ''}
        </p>
      </div>

      {onRefreshList ? (
        <div className="l2-author-list-members-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={loading || cooldownMs > 0}
            title={
              cooldownMs > 0
                ? `Global refresh cooldown — available in ${formatCooldown(cooldownMs)}`
                : 'Full re-fetch from Bluesky (independent of audit poll)'
            }
            onClick={() => void handleRefresh()}
          >
            {loading
              ? 'Refreshing…'
              : cooldownMs > 0
                ? `Refresh in ${formatCooldown(cooldownMs)}`
                : 'Refresh list'}
          </button>
        </div>
      ) : null}

      {error ? <p className="field-error">{error}</p> : null}

      {members && members.length > 0 ? (
        <>
          {truncated ? (
            <p className="l2-condition-hint">
              Showing a sample of {formatCount(members.length)} — full membership (
              {formatCount(memberCount)}) is used for matching; profiles are not loaded for
              every account.
            </p>
          ) : null}
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
        </>
      ) : null}

      {!loading && members && members.length === 0 ? (
        <p className="l2-condition-hint">No members cached yet — try Refresh list.</p>
      ) : null}
    </div>
  )
}
