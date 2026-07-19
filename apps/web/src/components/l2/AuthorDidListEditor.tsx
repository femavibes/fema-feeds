import { useEffect, useRef, useState } from 'react'
import { api, type ListMemberEntry } from '../../api/client'

interface Props {
  label: string
  dids: string[]
  onChange: (dids: string[]) => void
  hint?: string
  /** Placeholder for the add input (defaults to handle / DID / profile URL). */
  inputLabel?: string
}

/** Normalize pasted profile URLs / @handles / DIDs into a lookup token. */
function normalizeActor(raw: string): string {
  let v = raw.trim().replace(/^@+/, '')
  const profileMatch = v.match(/bsky\.app\/profile\/([^/?#]+)/i)
  if (profileMatch?.[1]) v = decodeURIComponent(profileMatch[1])
  return v.trim()
}

function isLikelyDid(value: string): boolean {
  return /^did:[a-z0-9]+:/i.test(value.trim())
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

function sameActor(a: string, b: string): boolean {
  const na = normalizeActor(a)
  const nb = normalizeActor(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (isLikelyDid(na) || isLikelyDid(nb)) return na.toLowerCase() === nb.toLowerCase()
  return na.toLowerCase() === nb.toLowerCase()
}

/**
 * Extra authors: URL-style add input on top (Enter to commit), resolved
 * members in a card list below — same visual language as Bluesky list members.
 */
export function AuthorDidListEditor({
  label,
  dids,
  onChange,
  hint,
  inputLabel = 'Handle, DID, or profile URL',
}: Props) {
  const [draft, setDraft] = useState('')
  const [resolved, setResolved] = useState<Map<string, ListMemberEntry>>(new Map())
  const [resolvingList, setResolvingList] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastEmittedKey = useRef(dids.join('\n'))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const key = dids.join('\n')
    if (key === lastEmittedKey.current) return
    lastEmittedKey.current = key
  }, [dids])

  // Resolve everyone already on the list for the member rows.
  useEffect(() => {
    const refs = [...new Set(dids.map(normalizeActor).filter(Boolean))]
    if (refs.length === 0) {
      setResolved(new Map())
      return
    }

    let cancelled = false
    setResolvingList(true)
    void api
      .resolveActors(refs)
      .then((res) => {
        if (cancelled) return
        const map = new Map<string, ListMemberEntry>()
        for (const m of res.members) {
          map.set(m.did, m)
          if (m.handle) map.set(m.handle.toLowerCase(), m)
        }
        // Also key by the original refs so unmatched storage forms still find a row.
        for (const ref of refs) {
          const hit = isLikelyDid(ref)
            ? map.get(ref)
            : map.get(ref.toLowerCase())
          if (hit) map.set(ref, hit)
        }
        setResolved(map)
      })
      .catch(() => {
        if (!cancelled) setResolved(new Map())
      })
      .finally(() => {
        if (!cancelled) setResolvingList(false)
      })

    return () => {
      cancelled = true
    }
  }, [dids.join('\n')])

  const memberForRef = (ref: string): ListMemberEntry | undefined => {
    const n = normalizeActor(ref)
    if (!n) return undefined
    return (
      resolved.get(n) ||
      resolved.get(n.toLowerCase()) ||
      (isLikelyDid(n) ? resolved.get(n) : undefined)
    )
  }

  const emit = (next: string[]) => {
    lastEmittedKey.current = next.join('\n')
    onChange(next)
  }

  const tryAdd = async () => {
    const ref = normalizeActor(draft)
    if (!ref) return
    if (dids.some((d) => sameActor(d, ref))) {
      setError('Already on this list')
      return
    }

    setAdding(true)
    setError(null)
    try {
      const res = await api.resolveActors([ref])
      const member = res.members[0]
      if (!member) {
        setError('Could not resolve that account')
        return
      }
      // Persist DID once resolved so renames/handle changes stay stable.
      const next = [...dids, member.did]
      emit(next)
      setResolved((prev) => {
        const map = new Map(prev)
        map.set(member.did, member)
        if (member.handle) map.set(member.handle.toLowerCase(), member)
        map.set(ref, member)
        return map
      })
      setDraft('')
      inputRef.current?.focus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve that account')
    } finally {
      setAdding(false)
    }
  }

  const removeAt = (index: number) => {
    emit(dids.filter((_, i) => i !== index))
  }

  return (
    <div className="l2-author-list-section author-did-list-editor">
      <div className="l2-author-list-section-head">
        <span className="l2-author-list-section-label">{label}</span>
        {resolvingList || adding ? (
          <span className="author-did-list-status">
            {adding ? 'Adding…' : 'Resolving…'}
          </span>
        ) : null}
      </div>

      <div className="l2-author-list-feed-form">
        <label>
          {inputLabel}
          <input
            ref={inputRef}
            className="mono author-did-input"
            value={draft}
            disabled={adding}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void tryAdd()
              }
            }}
            placeholder="handle, did:plc:…, or bsky.app/profile/…"
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        {hint ? <p className="l2-condition-hint">{hint}</p> : null}
      </div>

      {dids.length > 0 ? (
        <div className="l2-author-list-members card">
          <div className="l2-author-list-members-meta">
            <strong>
              {dids.length} author{dids.length === 1 ? '' : 's'}
            </strong>
            <p className="l2-condition-hint">Added on this condition</p>
          </div>

          <ul className="l2-author-list-members-list">
            {dids.map((ref, index) => {
              const member = memberForRef(ref)
              if (member) {
                return (
                  <li key={member.did}>
                    <div className="l2-author-list-member-row author-did-member-row">
                      <a
                        className="author-did-member-link"
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
                          <span className="l2-author-list-member-name">
                            {memberPrimaryLabel(member)}
                          </span>
                          {memberSecondaryLabel(member) ? (
                            <span className="l2-author-list-member-sub mono">
                              {memberSecondaryLabel(member)}
                            </span>
                          ) : null}
                        </span>
                      </a>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm author-did-remove"
                        onClick={() => removeAt(index)}
                        aria-label={`Remove ${memberPrimaryLabel(member)}`}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li key={`${ref}-${index}`}>
                  <div className="l2-author-list-member-row author-did-member-row">
                    <span className="author-did-member-link author-did-member-pending">
                      <span className="l2-author-list-member-avatar l2-author-list-member-avatar-fallback">
                        ?
                      </span>
                      <span className="l2-author-list-member-text">
                        <span className="l2-author-list-member-name mono">{ref}</span>
                        <span className="l2-author-list-member-sub">Resolving…</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm author-did-remove"
                      onClick={() => removeAt(index)}
                      aria-label="Remove author"
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
