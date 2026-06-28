import { useEffect, useState } from 'react'
import { api, type AuthUser } from '../api/client'

interface Props {
  onLoggedIn: (user: AuthUser) => void
}

export function LoginScreen({ onLoggedIn }: Props) {
  const [handle, setHandle] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [oauthHandle, setOauthHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<import('../api/client').AuthStatus | null>(null)

  useEffect(() => {
    void api.authStatus().then(setAuthStatus).catch(() => null)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const loginError = params.get('login_error')
    if (loginError) {
      setError(decodeURIComponent(loginError))
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('login') === 'ok') {
      window.history.replaceState({}, '', window.location.pathname)
      void api.authMe().then((res) => {
        if (res.user?.did) {
          onLoggedIn({ ...res.user, isMaster: res.isMaster, isGlobalVerifier: res.isGlobalVerifier })
        }
      })
    }
  }, [onLoggedIn])

  const loginWithAppPassword = async () => {
    const trimmedHandle = handle.trim()
    const trimmedPassword = appPassword.trim()
    if (!trimmedHandle || !trimmedPassword) return
    setBusy(true)
    setError(null)
    try {
      const normalized = trimmedHandle.includes('.') ? trimmedHandle : `${trimmedHandle}.bsky.social`
      const res = await api.authLoginAppPassword(normalized, trimmedPassword)
      let authUser = res.user
      let isMaster = res.isMaster
      let isGlobalVerifier = res.isGlobalVerifier ?? false
      if (!authUser?.did) {
        const me = await api.authMe()
        if (me.user) {
          authUser = me.user
          isMaster = me.isMaster
          isGlobalVerifier = me.isGlobalVerifier
        }
      }
      if (!authUser?.did) {
        throw new Error(
          'Login succeeded but the session was not saved. Refresh and try again, or restart the dev servers.',
        )
      }
      onLoggedIn({ ...authUser, isMaster, isGlobalVerifier })
      setAppPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  const loginWithOAuth = async () => {
    const trimmed = oauthHandle.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const normalized = trimmed.includes('.') ? trimmed : `${trimmed}.bsky.social`
      const res = await api.authLogin(normalized)
      window.location.href = res.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth login failed')
      setBusy(false)
    }
  }

  const canUseAppPassword = authStatus?.appPasswordLogin ?? false

  return (
    <div className="login-screen">
      <div className="login-card card">
        <h2>Sign in with Bluesky</h2>
        <p className="card-hint">
          Your account owns your custom feeds on this deployment. The first person to sign in
          becomes the <strong>deployment master</strong> (VPS owner). Friends need to be on the
          master&apos;s whitelist.
        </p>

        <section className="login-section">
          <h3 className="login-section-title">App password</h3>
          <p className="card-hint">
            Create an app password in Bluesky → Settings → App passwords. Works on localhost — no
            domain needed.
          </p>
          <label>
            Handle
            <input
              value={handle}
              disabled={busy || !canUseAppPassword}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loginWithAppPassword()}
              placeholder="you.bsky.social"
              autoComplete="username"
            />
          </label>
          <label>
            App password
            <input
              type="password"
              value={appPassword}
              disabled={busy || !canUseAppPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loginWithAppPassword()}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !handle.trim() || !appPassword.trim() || !canUseAppPassword}
            onClick={() => void loginWithAppPassword()}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </section>

        <section className="login-section login-section-muted">
          <div className="login-section-heading">
            <h3 className="login-section-title">Bluesky OAuth</h3>
            {!authStatus?.oauthConfigured && <span className="badge badge-muted">Needs HTTPS</span>}
          </div>
          {authStatus?.oauthConfigured ? (
            <>
              <p className="card-hint">
                One-click sign-in — no app password needed. Uses your deployment&apos;s public URL.
              </p>
              <label>
                Handle
                <input
                  value={oauthHandle}
                  disabled={busy}
                  onChange={(e) => setOauthHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void loginWithOAuth()}
                  placeholder="you.bsky.social"
                  autoComplete="username"
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !oauthHandle.trim()}
                onClick={() => void loginWithOAuth()}
              >
                {busy ? 'Redirecting…' : 'Continue with Bluesky'}
              </button>
            </>
          ) : (
            <>
              <p className="card-hint">
                One-click sign-in requires a public HTTPS URL on your deployment (e.g.{' '}
                <code>feedbuilder.fema.monster</code>). Set one up in Settings → Publishing.
              </p>
              <button type="button" className="btn btn-secondary" disabled>
                Continue with Bluesky
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
