import { useState } from 'react'
import { api } from '../api/client'

type Target = 'api' | 'web' | 'all'

interface HealthBody {
  ok: boolean
  bootId?: string
  capabilities?: {
    feedDraftLifecycle?: boolean
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchHealth(): Promise<HealthBody | null> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as HealthBody
  } catch {
    return null
  }
}

/** Wait until the current API process is gone (connection error or non-OK health). */
async function waitForApiDown(maxMs: number, onTick?: (elapsedSec: number) => void): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const elapsedSec = Math.floor((Date.now() - start) / 1000)
    onTick?.(elapsedSec)
    const health = await fetchHealth()
    if (!health?.ok) return true
    await sleep(400)
  }
  return false
}

/** Wait until health is OK with a new bootId (proves a fresh API process started). */
async function waitForApiUp(
  previousBootId: string | null,
  maxMs: number,
  onTick?: (elapsedSec: number) => void,
): Promise<boolean> {
  const start = Date.now()
  let consecutiveOk = 0
  while (Date.now() - start < maxMs) {
    const elapsedSec = Math.floor((Date.now() - start) / 1000)
    onTick?.(elapsedSec)
    const health = await fetchHealth()
    const isNew =
      health?.ok &&
      health.bootId &&
      (previousBootId === null || health.bootId !== previousBootId)
    if (isNew) {
      consecutiveOk++
      if (consecutiveOk >= 2) return true
    } else {
      consecutiveOk = 0
    }
    await sleep(800)
  }
  return false
}

export function DevRestart({ layout = 'inline' }: { layout?: 'inline' | 'card' }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function restart(target: Target) {
    setBusy(true)
    setMessage(null)

    let priorBootId: string | null = null
    if (target === 'api' || target === 'all') {
      const health = await fetchHealth()
      priorBootId = health?.bootId ?? null
    }

    try {
      try {
        const res = await api.devRestart(target)
        setMessage(res.message)
      } catch {
        // Expected when restart kills the API mid-request.
        setMessage('Restart triggered — waiting for API…')
      }

      if (target === 'api' || target === 'all') {
        setMessage('Stopping API…')
        const down = await waitForApiDown(30_000, (s) => {
          setMessage(`Stopping API… (${s}s)`)
        })
        if (!down) {
          setMessage(
            'API did not stop — run scripts/restart-dev.ps1 in a terminal, or see logs/dev-restart.log',
          )
          return
        }

        setMessage('Building & starting API…')
        const up = await waitForApiUp(priorBootId, 120_000, (s) => {
          setMessage(`Building & starting API… (${s}s)`)
        })
        if (!up) {
          setMessage(
            'API did not come back — see logs/dev-restart.log and logs/api-dev.log for build errors.',
          )
          return
        }
        const health = await fetchHealth()
        if (!health?.capabilities?.feedDraftLifecycle) {
          setMessage(
            'API is running but still looks old (missing feed draft routes). Check logs/dev-restart.log.',
          )
          return
        }
        setMessage('API is back with latest routes. Hard-refresh the page (Ctrl+Shift+R).')
      }

      if (target === 'web' || target === 'all') {
        await sleep(3000)
        setMessage((m) =>
          m?.includes('API is back')
            ? `${m} Reload the page for web changes.`
            : 'Web dev server restarting — reload this page.',
        )
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Restart failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`dev-restart${layout === 'card' ? ' dev-restart-card' : ''}`}>
      <span className="dev-restart-label">Dev</span>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => restart('api')}>
        Restart API
      </button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => restart('web')}>
        Restart web
      </button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => restart('all')}>
        Restart both
      </button>
      {message ? <span className="dev-restart-msg">{message}</span> : null}
      <p className="card-hint dev-restart-hint">
        Restart logs: <code>logs/dev-restart.log</code> and <code>logs/api-dev.log</code>
      </p>
    </div>
  )
}
