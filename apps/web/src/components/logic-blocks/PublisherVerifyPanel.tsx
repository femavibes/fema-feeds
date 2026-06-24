import { useEffect, useState } from 'react'
import type { PublisherTrustScope, PublisherVerificationStatus } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  isMaster: boolean
  isGlobalVerifier: boolean
  onChanged?: () => void
}

export function PublisherVerifyPanel({ isMaster, isGlobalVerifier, onChanged }: Props) {
  const [handle, setHandle] = useState('')
  const [status, setStatus] = useState<PublisherVerificationStatus | null>(null)
  const [scopeDeployment, setScopeDeployment] = useState(isMaster)
  const [scopeGlobal, setScopeGlobal] = useState(isGlobalVerifier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isGlobalVerifier) setScopeGlobal(true)
    if (isMaster) setScopeDeployment(true)
  }, [isGlobalVerifier, isMaster])

  if (!isMaster && !isGlobalVerifier) return null

  const selectedScopes = (): PublisherTrustScope[] => {
    const scopes: PublisherTrustScope[] = []
    if (scopeDeployment && isMaster) scopes.push('deployment')
    if (scopeGlobal && isGlobalVerifier) scopes.push('global')
    return scopes
  }

  const lookup = async () => {
    const trimmed = handle.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.lookupPublisherVerification(trimmed)
      setStatus(res.status)
      setScopeDeployment(!res.status.deploymentVerified && isMaster)
      setScopeGlobal(!res.status.globalVerified && isGlobalVerifier)
    } catch (e) {
      setStatus(null)
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: 'verify' | 'revoke') => {
    const scopes = selectedScopes()
    if (!handle.trim() || scopes.length === 0) {
      setError('Enter a handle and select at least one verification scope.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api.setPublisherVerification({
        handle: handle.trim(),
        scopes,
        action,
      })
      setStatus(res.status)
      setMessage(
        action === 'verify'
          ? `Verified publisher (${scopes.join(' + ')}). Updated ${res.packagesUpdated} listing(s).`
          : `Revoked verification (${scopes.join(' + ')}). Updated ${res.packagesUpdated} listing(s).`,
      )
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="publisher-verify-panel">
      <p className="settings-hint">Verification requests will be added here in a future update.</p>

      <label className="l2-inspector-field">
        Publisher handle
        <div className="publisher-verify-handle-row">
          <input
            value={handle}
            disabled={busy}
            placeholder="alice.bsky.social"
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void lookup()
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !handle.trim()} onClick={() => void lookup()}>
            Look up
          </button>
        </div>
      </label>

      {status ? (
        <div className="publisher-verify-status">
          <p className="publisher-verify-status-name">
            {status.displayName ?? status.handle ?? status.publisherDid}
          </p>
          <p className="publisher-verify-status-sub">
            {status.handle ? `@${status.handle}` : status.publisherDid}
          </p>
          <ul className="publisher-verify-status-list">
            <li>
              This deployment:{' '}
              {status.deploymentVerified ? (
                <span className="badge badge-muted">Verified</span>
              ) : (
                <span className="badge badge-muted">Not verified</span>
              )}
            </li>
            <li>
              Global marketplace:{' '}
              {status.globalVerified ? (
                <span className="badge badge-on">Verified</span>
              ) : (
                <span className="badge badge-muted">Not verified</span>
              )}
            </li>
          </ul>
        </div>
      ) : null}

      <fieldset className="publisher-verify-scopes">
        <legend>Apply to</legend>
        {isMaster ? (
          <label className="publisher-verify-scope-option">
            <input
              type="checkbox"
              checked={scopeDeployment}
              disabled={busy}
              onChange={(e) => setScopeDeployment(e.target.checked)}
            />
            This deployment only
          </label>
        ) : null}
        {isGlobalVerifier ? (
          <label className="publisher-verify-scope-option">
            <input
              type="checkbox"
              checked={scopeGlobal}
              disabled={busy}
              onChange={(e) => setScopeGlobal(e.target.checked)}
            />
            Global marketplace
          </label>
        ) : null}
        {isMaster && isGlobalVerifier ? (
          <p className="card-hint">You can assign both seals in one action.</p>
        ) : null}
      </fieldset>

      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}

      <div className="publisher-verify-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || !status}
          onClick={() => void runAction('verify')}
        >
          Verify publisher
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || !status}
          onClick={() => void runAction('revoke')}
        >
          Revoke selected
        </button>
      </div>
    </section>
  )
}
