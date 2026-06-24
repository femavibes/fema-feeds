import { useEffect, useMemo, useState } from 'react'
import { api, type ListMemberEntry } from '../../api/client'

interface Props {
  label: string
  dids: string[]
  onChange: (dids: string[]) => void
  hint?: string
}

function normalizeDid(raw: string): string {
  return raw.trim()
}

function isLikelyDid(value: string): boolean {
  return /^did:[a-z0-9]+:/i.test(value.trim())
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

function ResolvedAuthorChip({ member }: { member: ListMemberEntry }) {
  return (
    <a
      className="author-did-resolved"
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
        {member.handle && member.displayName?.trim() ? (
          <span className="author-did-resolved-handle mono">@{member.handle}</span>
        ) : null}
      </span>
    </a>
  )
}

export function AuthorDidListEditor({ label, dids, onChange, hint }: Props) {
  const [rows, setRows] = useState<string[]>(() => (dids.length ? dids : ['']))
  const [resolved, setResolved] = useState<Map<string, ListMemberEntry>>(new Map())
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    setRows(dids.length ? dids : [''])
  }, [dids])

  const validDids = useMemo(
    () => [...new Set(rows.map(normalizeDid).filter(isLikelyDid))],
    [rows],
  )

  useEffect(() => {
    if (validDids.length === 0) {
      setResolved(new Map())
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setResolving(true)
      void api
        .resolveAuthorProfiles(validDids)
        .then((res) => {
          if (cancelled) return
          setResolved(new Map(res.members.map((m) => [m.did, m])))
        })
        .catch(() => {
          if (!cancelled) setResolved(new Map())
        })
        .finally(() => {
          if (!cancelled) setResolving(false)
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [validDids.join('\n')])

  const emit = (nextRows: string[]) => {
    setRows(nextRows.length ? nextRows : [''])
    onChange(nextRows.map(normalizeDid).filter(Boolean))
  }

  const updateRow = (index: number, value: string) => {
    const next = [...rows]
    next[index] = value
    emit(next)
  }

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index)
    emit(next.length ? next : [''])
  }

  const addRow = () => {
    emit([...rows, ''])
  }

  return (
    <div className="author-did-list-editor">
      <div className="author-did-list-head">
        <span className="author-did-list-label">{label}</span>
        {resolving ? <span className="author-did-list-status">Resolving…</span> : null}
      </div>

      <div className="author-did-list-rows">
        {rows.map((row, index) => {
          const did = normalizeDid(row)
          const member = did && isLikelyDid(did) ? resolved.get(did) : undefined
          return (
            <div key={`${index}-${did || 'empty'}`} className="author-did-row">
              <div className="author-did-row-inputs">
                <input
                  className="mono author-did-input"
                  value={row}
                  onChange={(e) => updateRow(index, e.target.value)}
                  placeholder="did:plc:…"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm author-did-remove"
                  onClick={() => removeRow(index)}
                  aria-label="Remove DID"
                  disabled={rows.length <= 1 && !row.trim()}
                >
                  ×
                </button>
              </div>
              {member ? <ResolvedAuthorChip member={member} /> : null}
            </div>
          )
        })}
      </div>

      <button type="button" className="btn btn-ghost btn-sm author-did-add" onClick={addRow}>
        + Add DID
      </button>

      {hint ? <p className="l2-condition-hint">{hint}</p> : null}
    </div>
  )
}
