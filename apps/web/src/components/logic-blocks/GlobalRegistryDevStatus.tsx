import { useEffect, useState } from 'react'
import { api } from '../../api/client'

const ROLE_LABELS: Record<'registry' | 'consumer' | 'embedded', string> = {
  registry: 'Global registry host',
  consumer: 'Feed builder (global catalog remote)',
  embedded: 'Offline dev stub',
}

export function GlobalRegistryDevStatus() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.globalMarketplaceStatus>> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api
      .globalMarketplaceStatus()
      .then((res) => {
        setStatus(res)
        setError(null)
      })
      .catch(() => setError('Could not load global marketplace status'))
  }, [])

  if (error) return <p className="card-hint">{error}</p>
  if (!status) return <p className="card-hint">Loading global marketplace status…</p>

  return (
    <section className="settings-section">
      <h3 className="settings-subheading">Global marketplace registry</h3>
      <p className="settings-hint">{status.hint}</p>
      <dl className="settings-kv">
        <div>
          <dt>Role</dt>
          <dd>{ROLE_LABELS[status.registryRole]}</dd>
        </div>
        <div>
          <dt>Verifier</dt>
          <dd>@{status.verifierHandle}</dd>
        </div>
        {status.registryRole === 'registry' ? (
          <div>
            <dt>Public catalog</dt>
            <dd>
              <code>{status.publicCatalogPath}</code>
            </dd>
          </div>
        ) : null}
        {status.remoteUrl ? (
          <div>
            <dt>Registry URL</dt>
            <dd>
              <code>{status.remoteUrl}</code>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}
