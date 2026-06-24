import { useEffect, useState } from 'react'

import { api, type DeploymentAccessSettings } from '../api/client'

function parseDidLines(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const did = line.trim()
    if (!did.startsWith('did:') || seen.has(did)) continue
    seen.add(did)
    out.push(did)
  }
  return out
}

interface ResolvedInvite {
  did: string
  handle: string
  displayName?: string
}

interface Props {
  compact?: boolean
  onSaved?: (access: DeploymentAccessSettings) => void
}

export function WhitelistEditor({ compact = false, onSaved }: Props) {
  const [access, setAccess] = useState<DeploymentAccessSettings | null>(null)
  const [draftDids, setDraftDids] = useState('')
  const [inviteHandle, setInviteHandle] = useState('')
  const [pendingInvites, setPendingInvites] = useState<ResolvedInvite[]>([])
  const [busy, setBusy] = useState(false)
  const [resolveBusy, setResolveBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.getDeploymentAccess().then((res) => {
      setAccess(res.access)
      setDraftDids(res.access.allowedDids.join('\n'))
    }).catch(() => null)
  }, [])

  const addResolvedInvite = (actor: ResolvedInvite) => {
    setError(null)
    setSaved(false)
    setPendingInvites((prev) => (prev.some((p) => p.did === actor.did) ? prev : [...prev, actor]))
    const current = parseDidLines(draftDids)
    if (!current.includes(actor.did)) {
      setDraftDids((prev) => (prev.trim() ? `${prev.trim()}\n${actor.did}` : actor.did))
    }
    setInviteHandle('')
  }

  const resolveInvite = async () => {
    const handle = inviteHandle.trim()
    if (!handle) return
    setResolveBusy(true)
    setError(null)
    try {
      const { actor } = await api.resolveWhitelistHandle(handle)
      addResolvedInvite(actor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve handle')
    } finally {
      setResolveBusy(false)
    }
  }

  const removePending = (did: string) => {
    setPendingInvites((prev) => prev.filter((p) => p.did !== did))
    const remaining = parseDidLines(draftDids).filter((d) => d !== did)
    setDraftDids(remaining.join('\n'))
  }

  const save = async () => {
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const allowedDids = parseDidLines(draftDids)
      const res = await api.saveDeploymentAccess(allowedDids)
      setAccess(res.access)
      setDraftDids(res.access.allowedDids.join('\n'))
      setPendingInvites([])
      setSaved(true)
      onSaved?.(res.access)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`whitelist-editor${compact ? ' whitelist-editor-compact' : ''}`}>
      <div className="whitelist-invite-row">
        <label className="whitelist-invite-label">
          Invite by handle
          <div className="whitelist-invite-controls">
            <input
              value={inviteHandle}
              disabled={resolveBusy || busy}
              onChange={(e) => setInviteHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void resolveInvite()}
              placeholder="friend.bsky.social"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={resolveBusy || busy || !inviteHandle.trim()}
              onClick={() => void resolveInvite()}
            >
              {resolveBusy ? 'Looking up…' : 'Add'}
            </button>
          </div>
        </label>
      </div>

      {pendingInvites.length > 0 && (
        <ul className="whitelist-pending">
          {pendingInvites.map((invite) => (
            <li key={invite.did} className="whitelist-pending-item">
              <div className="whitelist-pending-meta">
                <span className="whitelist-pending-handle">
                  @{invite.handle}
                  {invite.displayName ? ` (${invite.displayName})` : ''}
                </span>
                <code className="mono whitelist-pending-did">{invite.did}</code>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => removePending(invite.did)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!compact && (
        <label>
          Login whitelist (one Bluesky DID per line)
          <textarea
            className="mono"
            rows={5}
            value={draftDids}
            disabled={busy}
            onChange={(e) => {
              setDraftDids(e.target.value)
              setSaved(false)
            }}
            placeholder={'did:plc:friend1…\ndid:plc:friend2…'}
          />
        </label>
      )}

      {access?.masterDid && (
        <p className="settings-hint">
          Master: <code className="mono">{access.masterDid}</code>
        </p>
      )}

      {error && <p className="field-error">{error}</p>}

      <div className="whitelist-editor-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save whitelist'}
        </button>
        {saved && <span className="settings-hint">Saved.</span>}
      </div>
    </div>
  )
}
