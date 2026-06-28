import { useEffect, useRef, useState } from 'react'
import type { EnrichmentSettings, FeedgenPublishMode, FeedgenSettings } from '@cfb/core-types'
import { duckdnsPublicHost, duckdnsPublicUrl, inferFeedgenPublishMode, isTailscaleFunnelUrl } from '@cfb/core-types'
import { DevRestart } from './DevRestart'
import { GlobalRegistryDevStatus } from './logic-blocks/GlobalRegistryDevStatus'
import { IngestSettingsSection } from './IngestSettingsSection'
import { GlobalPrefilterEditor } from './GlobalPrefilterEditor'
import { PurgeSettingsSection } from './PurgeSettingsSection'
import { WhitelistEditor } from './WhitelistEditor'
import { useNsfwBlur } from '../lib/nsfw-blur'
import type {
  FeedgenSettingsPublic,
  FeedgenSettingsResponse,
  IngestStats,
  ListCacheEntry,
  LabelerSource,
} from '../api/client'
import { api } from '../api/client'
import type { SettingsWorkspaceView } from '../lib/workspace-views'

const EMPTY_FEEDGEN_RESPONSE: FeedgenSettingsResponse = {
  settings: { generatorDid: '', publicBaseUrl: '' },
  writable: false,
  source: 'default',
}

interface Props {
  view: SettingsWorkspaceView
  isMaster: boolean
  stats: IngestStats | null
  listCache: ListCacheEntry[]
  labelers: LabelerSource[]
  enrichment: EnrichmentSettings | null
  onRefresh: () => void
  onPollLists: () => Promise<void>
  onAddLabeler: (did: string, name: string) => Promise<void>
  onToggleLabeler: (did: string, enabled: boolean) => Promise<void>
  onDeleteLabeler: (did: string) => Promise<void>
  onSaveEnrichment: (patch: Partial<EnrichmentSettings>) => Promise<void>
  onSaveFeedgen: (patch: Partial<FeedgenSettings>) => Promise<void>
  highlightPublishing?: boolean
}

const VIEW_HINTS: Record<SettingsWorkspaceView, string> = {
  publishing:
    'Bluesky needs a stable public HTTPS URL for your feedgen. Pick where you run the app (home PC vs VPS), then follow the setup — no router hacking required for home deploys.',
  ingest: 'Live firehose ingestion and L1 filtering. When on, matching posts are saved to the pool.',
  pool: 'Posts in your ingestion pool and cached author lists across projects.',
  purge: 'Automatic cleanup of old or low-engagement posts from the pool. Keeps database size manageable.',
  labelers:
    'Moderation labels are applied after posting. Bluesky Moderation is enabled by default; add custom labeler DIDs to query at ingest and during label refresh sweeps.',
  enrichment:
    'Real-time label streams subscribe to enabled labelers; the refresh sweeper re-queries as a fallback. Run workers: label-stream and/or refresh-labels.',
  access:
    'The master account controls deployment-wide access. Friends sign in with their own Bluesky accounts to build their own feeds.',
  user: 'Personal display preferences for this account.',
  developer: 'Restart local API / UI after code changes.',
}

const VIEW_TITLES: Record<SettingsWorkspaceView, string> = {
  publishing: 'Feed publishing',
  ingest: 'Jetstream ingest',
  pool: 'Pool & lists',
  purge: 'Post purge',
  labelers: 'Labelers',
  enrichment: 'Enrichment & label refresh',
  access: 'Deployment access',
  user: 'User preferences',
  developer: 'Developer',
}

export function SettingsPage({
  view,
  isMaster,
  stats,
  listCache,
  labelers,
  enrichment,
  onRefresh,
  onPollLists,
  onAddLabeler,
  onToggleLabeler,
  onDeleteLabeler,
  onSaveEnrichment,
  onSaveFeedgen,
  highlightPublishing,
}: Props) {
  const publishingRef = useRef<HTMLElement>(null)
  const [showGlobalPrefilter, setShowGlobalPrefilter] = useState(false)

  useEffect(() => {
    if (highlightPublishing && view === 'publishing' && publishingRef.current) {
      publishingRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [highlightPublishing, view])

  if (showGlobalPrefilter && view === 'ingest' && isMaster) {
    return <GlobalPrefilterEditor onClose={() => setShowGlobalPrefilter(false)} />
  }

  return (
    <div className="workspace-page settings-page">
      <header className="workspace-context-head">
        <div className="workspace-context-head-row">
          <h2>{VIEW_TITLES[view]}</h2>
        </div>
        <p className="card-hint">{VIEW_HINTS[view]}</p>
      </header>

      {view === 'publishing' && (
        <section
          ref={publishingRef}
          className={`settings-section${highlightPublishing ? ' settings-section-highlight' : ''}`}
          id="feed-publishing-settings"
        >
          <FeedPublishingSection onSave={onSaveFeedgen} />
        </section>
      )}

      {view === 'ingest' && isMaster && (
        <IngestSettingsSection
          onStatusChange={() => onRefresh()}
          onOpenGlobalPrefilter={() => setShowGlobalPrefilter(true)}
        />
      )}

      {view === 'ingest' && !isMaster && (
        <p className="card-hint">Only the deployment master can start or stop ingest.</p>
      )}

      {view === 'pool' && (
        <section className="settings-section">
          <div className="settings-stats-grid">
            <div className="settings-stat-card">
              <span className="settings-stat-value">{stats?.poolSize ?? '—'}</span>
              <span className="settings-stat-label">posts in pool</span>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-value">{stats?.listCacheCount ?? '—'}</span>
              <span className="settings-stat-label">author lists cached</span>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-value">{stats?.listsDueForPoll ?? '—'}</span>
              <span className="settings-stat-label">lists due for poll</span>
            </div>
          </div>
          {stats?.byProject && Object.keys(stats.byProject).length > 0 && (
            <table className="settings-table" style={{ marginTop: '0.75rem' }}>
              <thead><tr><th>Project</th><th>Posts in pool</th></tr></thead>
              <tbody>
                {Object.entries(stats.byProject).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                  <tr key={id}><td>{id}</td><td>{count.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {stats?.byProject && Object.keys(stats.byProject).length > 0 && (
            <table className="settings-table" style={{ marginTop: '0.75rem' }}>
              <thead><tr><th>Project</th><th>Posts in pool</th></tr></thead>
              <tbody>
                {Object.entries(stats.byProject).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                  <tr key={id}><td>{id}</td><td>{count.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="settings-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>
              Refresh stats
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onPollLists()}>
              Poll due lists now
            </button>
          </div>
          {listCache.length > 0 && (
            <table className="settings-table">
              <thead>
                <tr>
                  <th>List</th>
                  <th>Project</th>
                  <th>Members</th>
                  <th>Refreshed</th>
                </tr>
              </thead>
              <tbody>
                {listCache.map((l) => (
                  <tr key={l.listId}>
                    <td className="mono">{l.listId}</td>
                    <td>{l.projectId}</td>
                    <td>{l.memberCount}</td>
                    <td>{l.refreshedAt ? new Date(l.refreshedAt).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {view === 'purge' && isMaster && (
        <section className="settings-section">
          <PurgeSettingsSection />
        </section>
      )}

      {view === 'purge' && !isMaster && (
        <p className="card-hint">Only the deployment master can configure purge settings.</p>
      )}

      {view === 'labelers' && isMaster && (
        <section className="settings-section">
          <LabelerManager
            labelers={labelers}
            onAdd={onAddLabeler}
            onToggle={onToggleLabeler}
            onDelete={onDeleteLabeler}
          />
        </section>
      )}

      {view === 'labelers' && !isMaster && (
        <p className="card-hint">Only the deployment master can manage labelers.</p>
      )}

      {view === 'enrichment' && isMaster &&
        (enrichment ? (
          <section className="settings-section">
            <EnrichmentForm settings={enrichment} onSave={onSaveEnrichment} />
          </section>
        ) : (
          <div className="empty-state">Loading enrichment settings…</div>
        ))}

      {view === 'enrichment' && !isMaster && (
        <p className="card-hint">Only the deployment master can edit enrichment settings.</p>
      )}

      {view === 'access' && <DeploymentAccessSection isMaster={isMaster} />}

      {view === 'user' && <UserPreferencesSection />}

      {view === 'developer' && isMaster && (
        <section className="settings-section settings-section-dev">
          <GlobalRegistryDevStatus />
          <DevRestart layout="card" />
        </section>
      )}

      {view === 'developer' && !isMaster && (
        <p className="card-hint">Only the deployment master can restart dev services.</p>
      )}
    </div>
  )
}

function DeploymentAccessSection({ isMaster }: { isMaster: boolean }) {
  return (
    <section className="settings-section">
      <p className="settings-hint">
        The <strong>master account</strong> is whoever deployed this instance (first login, or set
        via <code>CFB_MASTER_DID</code>). Only the master can manage labelers, enrichment, ingest,
        and the login whitelist.
      </p>
      {isMaster ? (
        <WhitelistEditor />
      ) : (
        <p className="card-hint">Only the deployment master can edit the login whitelist.</p>
      )}
    </section>
  )
}

function UserPreferencesSection() {
  const { blurNsfw, setBlurNsfw } = useNsfwBlur()

  return (
    <section className="settings-section">
      <label className="settings-check">
        <input
          type="checkbox"
          checked={blurNsfw}
          onChange={(e) => setBlurNsfw(e.target.checked)}
        />
        Blur NSFW media
      </label>
      <p className="card-hint">
        When enabled, images on posts labeled as porn, sexual, nudity, or graphic-media are blurred
        until you click to reveal.
      </p>
    </section>
  )
}

function LabelerManager({
  labelers,
  onAdd,
  onToggle,
  onDelete,
}: {
  labelers: LabelerSource[]
  onAdd: (did: string, name: string) => Promise<void>
  onToggle: (did: string, enabled: boolean) => Promise<void>
  onDelete: (did: string) => Promise<void>
}) {
  const [did, setDid] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!did.trim() || !name.trim()) return
    setBusy(true)
    try {
      await onAdd(did.trim(), name.trim())
      setDid('')
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="labeler-manager">
      <table className="settings-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>DID</th>
            <th>On</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {labelers.map((l) => (
            <tr key={l.did}>
              <td>
                {l.name}
                {l.isBuiltin && <span className="badge badge-muted"> built-in</span>}
              </td>
              <td className="mono settings-did">{l.did}</td>
              <td>
                <input
                  type="checkbox"
                  checked={l.enabled}
                  onChange={(e) => void onToggle(l.did, e.target.checked)}
                />
              </td>
              <td>
                {!l.isBuiltin && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void onDelete(l.did)}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="labeler-add">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Labeler name" />
        <input
          value={did}
          onChange={(e) => setDid(e.target.value)}
          placeholder="did:plc:…"
          className="mono"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void submit()}
        >
          Add labeler
        </button>
      </div>
    </div>
  )
}

function FeedPublishingSection({
  onSave,
}: {
  onSave: (patch: Partial<FeedgenSettings>) => Promise<void>
}) {
  const [feedgen, setFeedgen] = useState<FeedgenSettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await api.getFeedgenSettings()
      setFeedgen(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load feed publishing settings'
      setLoadError(msg)
      setFeedgen(EMPTY_FEEDGEN_RESPONSE)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSave = async (patch: Partial<FeedgenSettings>) => {
    await onSave(patch)
    await load()
  }

  if (loading) {
    return <p className="settings-hint">Loading feed publishing settings…</p>
  }

  return (
    <>
      {loadError && (
        <div className="settings-load-error">
          <p className="field-error">{loadError}</p>
          <p className="card-hint">
            The API may be running old code. Use <strong>Developer → Restart API</strong> below,
            then retry.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {feedgen && (
        <FeedgenForm
          settings={feedgen.settings}
          publisherDid={feedgen.publisherDid}
          writable={feedgen.writable && !loadError}
          source={feedgen.source}
          onSave={handleSave}
          onReload={load}
        />
      )}
    </>
  )
}

type DeployTarget = 'home' | 'vps' | 'hosted'
type VpsExposure = 'duckdns' | 'own-domain' | 'custom'
type HomeExposure = 'tailscale' | 'own-cloudflare' | 'custom'

function inferDeployTarget(
  settings: FeedgenSettingsPublic,
  opts: { cloudflareTokenSet?: boolean; duckdnsTokenSet?: boolean },
): DeployTarget {
  const mode = inferFeedgenPublishMode(settings, opts)
  return mode === 'cloudflare' || mode === 'tailscale' ? 'home' : 'vps'
}

function inferVpsExposure(
  settings: FeedgenSettingsPublic,
  opts: { cloudflareTokenSet?: boolean; duckdnsTokenSet?: boolean },
): VpsExposure {
  const mode = inferFeedgenPublishMode(settings, opts)
  if (mode === 'duckdns') return 'duckdns'
  if (mode === 'custom') return 'own-domain'
  return 'duckdns'
}

function inferHomeExposure(
  settings: FeedgenSettingsPublic,
  opts: { cloudflareTokenSet?: boolean; duckdnsTokenSet?: boolean },
): HomeExposure {
  const mode = inferFeedgenPublishMode(settings, opts)
  if (mode === 'tailscale' || isTailscaleFunnelUrl(settings.publicBaseUrl)) return 'tailscale'
  if (mode === 'cloudflare') return 'own-cloudflare'
  if (mode === 'custom') return 'custom'
  return 'tailscale'
}

function publishModeFromDeploy(
  target: DeployTarget,
  vpsExposure: VpsExposure,
  homeExposure: HomeExposure,
): FeedgenPublishMode {
  if (target === 'home') {
    if (homeExposure === 'tailscale') return 'tailscale'
    if (homeExposure === 'own-cloudflare') return 'cloudflare'
    return 'custom'
  }
  if (vpsExposure === 'duckdns') return 'duckdns'
  return 'custom'
}

function FeedgenForm({
  settings,
  publisherDid,
  writable,
  source,
  onSave,
  onReload,
}: {
  settings: FeedgenSettingsPublic
  publisherDid?: string | null
  writable: boolean
  source: FeedgenSettingsResponse['source']
  onSave: (patch: Partial<FeedgenSettings>) => Promise<void>
  onReload: () => Promise<void>
}) {
  const inferOpts = {
    cloudflareTokenSet: settings.cloudflareTunnelTokenSet,
    duckdnsTokenSet: settings.duckdnsTokenSet,
  }
  const [deployTarget, setDeployTarget] = useState<DeployTarget>(() =>
    inferDeployTarget(settings, inferOpts),
  )
  const [vpsExposure, setVpsExposure] = useState<VpsExposure>(() =>
    inferVpsExposure(settings, inferOpts),
  )
  const [homeExposure, setHomeExposure] = useState<HomeExposure>(() =>
    inferHomeExposure(settings, inferOpts),
  )
  const mode: FeedgenPublishMode | null =
    deployTarget === 'hosted'
      ? null
      : publishModeFromDeploy(deployTarget, vpsExposure, homeExposure)
  const [draft, setDraft] = useState(settings)
  const [duckdnsTokenInput, setDuckdnsTokenInput] = useState('')
  const [cloudflareTokenInput, setCloudflareTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const opts = {
      cloudflareTokenSet: settings.cloudflareTunnelTokenSet,
      duckdnsTokenSet: settings.duckdnsTokenSet,
    }
    setDraft(settings)
    setDeployTarget(inferDeployTarget(settings, opts))
    setVpsExposure(inferVpsExposure(settings, opts))
    setHomeExposure(inferHomeExposure(settings, opts))
    setDuckdnsTokenInput('')
    setCloudflareTokenInput('')
  }, [settings])

  const duckdnsSlug = draft.duckdnsSubdomain?.trim() ?? ''
  const duckdnsHost = duckdnsSlug ? duckdnsPublicHost(duckdnsSlug) : ''
  const duckdnsUrl = duckdnsSlug ? duckdnsPublicUrl(duckdnsSlug) : ''
  const duckdnsReady = Boolean(duckdnsSlug && (duckdnsTokenInput.trim() || settings.duckdnsTokenSet))

  const cloudflareUrl = draft.cloudflarePublicUrl?.trim() ?? ''
  const cloudflareReady = Boolean(cloudflareUrl)

  const tailscaleUrl = draft.publicBaseUrl?.trim() ?? ''
  const tailscaleReady = isTailscaleFunnelUrl(tailscaleUrl)

  const customUrlReady = Boolean(draft.publicBaseUrl?.trim())

  const setDeployHome = () => {
    setDeployTarget('home')
    setHomeExposure('tailscale')
  }

  const setDeployVps = () => {
    setDeployTarget('vps')
    setVpsExposure('duckdns')
  }

  const save = async () => {
    if (!mode) return
    setBusy(true)
    setSaved(false)
    setError(null)
    try {
      const patch: Partial<FeedgenSettings> = {
        publishMode: mode,
        generatorDid: draft.generatorDid.trim(),
        privacyPolicyUrl: draft.privacyPolicyUrl?.trim() || undefined,
        termsOfServiceUrl: draft.termsOfServiceUrl?.trim() || undefined,
      }

      if (mode === 'cloudflare') {
        patch.cloudflarePublicUrl = cloudflareUrl.replace(/\/$/, '')
        patch.publicBaseUrl = patch.cloudflarePublicUrl
        patch.duckdnsSubdomain = undefined
        patch.duckdnsToken = undefined
        if (cloudflareTokenInput.trim()) {
          patch.cloudflareTunnelToken = cloudflareTokenInput.trim()
        }
      } else if (mode === 'tailscale') {
        patch.publicBaseUrl = tailscaleUrl.replace(/\/$/, '')
        patch.duckdnsSubdomain = undefined
        patch.duckdnsToken = undefined
        patch.cloudflarePublicUrl = undefined
        patch.cloudflareTunnelToken = undefined
      } else if (mode === 'duckdns') {
        patch.duckdnsSubdomain = duckdnsSlug
        patch.cloudflarePublicUrl = undefined
        patch.cloudflareTunnelToken = undefined
        if (duckdnsTokenInput.trim()) {
          patch.duckdnsToken = duckdnsTokenInput.trim()
        }
        if (duckdnsSlug) {
          patch.publicBaseUrl = duckdnsPublicUrl(duckdnsSlug)
        }
      } else {
        patch.publicBaseUrl = draft.publicBaseUrl.trim().replace(/\/$/, '')
        patch.duckdnsSubdomain = undefined
        patch.duckdnsToken = undefined
        patch.cloudflarePublicUrl = undefined
        patch.cloudflareTunnelToken = undefined
      }

      await onSave(patch)
      setSaved(true)
      setDuckdnsTokenInput('')
      setCloudflareTokenInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const syncDuckDnsNow = async () => {
    setSyncBusy(true)
    setError(null)
    try {
      const res = await api.syncDuckDns()
      setDraft(res.settings)
      await onReload()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DuckDNS sync failed')
    } finally {
      setSyncBusy(false)
    }
  }

  const checkPublicUrlNow = async () => {
    setSyncBusy(true)
    setError(null)
    try {
      const res = await api.checkCloudflareTunnel()
      setDraft(res.settings)
      await onReload()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection check failed')
    } finally {
      setSyncBusy(false)
    }
  }

  const sourceLabel =
    source === 'settings'
      ? 'Saved in database'
      : source === 'env'
        ? 'From .env (not yet saved to database)'
        : 'Defaults — fill in below'

  const saveDisabled =
    !mode ||
    busy ||
    (mode === 'cloudflare' && homeExposure === 'own-cloudflare' && !cloudflareReady) ||
    (mode === 'tailscale' && !tailscaleReady) ||
    (mode === 'duckdns' && !duckdnsReady) ||
    (mode === 'custom' && !customUrlReady)

  const showVpsOwnDomain = deployTarget === 'vps' && mode === 'custom' && vpsExposure === 'own-domain'
  const showAdvancedCustom =
    mode === 'custom' &&
    ((deployTarget === 'home' && homeExposure === 'custom') ||
      (deployTarget === 'vps' && vpsExposure === 'custom'))

  return (
    <div className={`feedgen-form ${busy || syncBusy ? 'busy' : ''}`}>
      <p className="settings-hint">
        <span className="badge badge-muted">{sourceLabel}</span>
        {publisherDid && (
          <>
            {' '}
            · Publishing as <code className="mono">{publisherDid}</code>
          </>
        )}
        {!writable && ' · Set DATABASE_URL to edit here; until then, use .env.'}
      </p>

      <p className="card-hint">
        <strong>Step 1:</strong> Where is this running? Home PC, your own VPS, or (soon) paid hosting on{' '}
        <code>fema.monster</code>.
      </p>

      <div className="feedgen-mode-picker feedgen-mode-picker-deploy" role="radiogroup" aria-label="Deployment target">
        <label className={`feedgen-mode-card${deployTarget === 'home' ? ' active' : ''}`}>
          <input
            type="radio"
            name="deploy-target"
            value="home"
            checked={deployTarget === 'home'}
            disabled={!writable}
            onChange={() => setDeployHome()}
          />
          <span className="feedgen-mode-title">Home deployment</span>
          <span className="feedgen-mode-desc">Your PC — Tailscale Funnel or Cloudflare Tunnel</span>
        </label>
        <label className={`feedgen-mode-card${deployTarget === 'vps' ? ' active' : ''}`}>
          <input
            type="radio"
            name="deploy-target"
            value="vps"
            checked={deployTarget === 'vps'}
            disabled={!writable}
            onChange={() => setDeployVps()}
          />
          <span className="feedgen-mode-title">VPS deployment</span>
          <span className="feedgen-mode-desc">Cloud server with a public IP (Linode, DO, etc.)</span>
        </label>
        <label
          className={`feedgen-mode-card feedgen-mode-card-hosted${deployTarget === 'hosted' ? ' active' : ''}`}
        >
          <input
            type="radio"
            name="deploy-target"
            value="hosted"
            checked={deployTarget === 'hosted'}
            onChange={() => setDeployTarget('hosted')}
          />
          <span className="feedgen-mode-title">
            Easy hosting{' '}
            <span className="badge badge-muted">Coming soon</span>
          </span>
          <span className="feedgen-mode-desc">
            Paid <code>fema.monster</code> hosting — we handle the public URL and uptime
          </span>
        </label>
      </div>

      {deployTarget === 'hosted' && (
        <div className="feedgen-hosted-preview duckdns-guide">
          <h4>Easy hosting on fema.monster</h4>
          <p className="card-hint">
            A paid tier for people who don&apos;t want to run tunnels, DuckDNS, or a VPS. We host your
            feedgen endpoint on <code>fema.monster</code> — stable HTTPS, no router or DNS setup on
            your side.
          </p>
          <ul className="feedgen-hosted-perks">
            <li>Public feed URL on <code>fema.monster</code> (no slug juggling)</li>
            <li>HTTPS and <code>did:web</code> handled for you</li>
            <li>More perks TBD — support, backups, multi-feed tooling, etc.</li>
          </ul>
          <p className="settings-hint">
            Not available yet. Use <strong>Home</strong> or <strong>VPS</strong> above for now.
          </p>
        </div>
      )}

      {deployTarget === 'vps' && (
        <div className="feedgen-sub-picker" role="radiogroup" aria-label="VPS hostname option">
          <p className="card-hint">
            <strong>Step 2:</strong> How should Bluesky reach your server?
          </p>
          <div className="feedgen-mode-picker feedgen-mode-picker-compact">
            <label className={`feedgen-mode-card${vpsExposure === 'duckdns' ? ' active' : ''}`}>
              <input
                type="radio"
                name="vps-exposure"
                value="duckdns"
                checked={vpsExposure === 'duckdns'}
                disabled={!writable}
                onChange={() => setVpsExposure('duckdns')}
              />
              <span className="feedgen-mode-title">DuckDNS (recommended)</span>
              <span className="feedgen-mode-desc">Free <code>myfeeds.duckdns.org</code> — no domain purchase</span>
            </label>
            <label className={`feedgen-mode-card${vpsExposure === 'own-domain' ? ' active' : ''}`}>
              <input
                type="radio"
                name="vps-exposure"
                value="own-domain"
                checked={vpsExposure === 'own-domain'}
                disabled={!writable}
                onChange={() => setVpsExposure('own-domain')}
              />
              <span className="feedgen-mode-title">My own domain</span>
              <span className="feedgen-mode-desc">A record + HTTPS on the VPS (Caddy in Docker profile)</span>
            </label>
            <label className={`feedgen-mode-card${vpsExposure === 'custom' ? ' active' : ''}`}>
              <input
                type="radio"
                name="vps-exposure"
                value="custom"
                checked={vpsExposure === 'custom'}
                disabled={!writable}
                onChange={() => setVpsExposure('custom')}
              />
              <span className="feedgen-mode-title">Custom (advanced)</span>
              <span className="feedgen-mode-desc">You handle DNS, HTTPS, and routing — paste any public URL</span>
            </label>
          </div>
        </div>
      )}

      {deployTarget === 'home' && (
        <div className="feedgen-sub-picker" role="radiogroup" aria-label="Home exposure option">
          <p className="card-hint">
            <strong>Step 2:</strong> How should Bluesky reach your PC without router port forwarding?
          </p>
          <div className="feedgen-mode-picker feedgen-mode-picker-compact">
            <label className={`feedgen-mode-card${homeExposure === 'tailscale' ? ' active' : ''}`}>
              <input
                type="radio"
                name="home-exposure"
                value="tailscale"
                checked={homeExposure === 'tailscale'}
                disabled={!writable}
                onChange={() => setHomeExposure('tailscale')}
              />
              <span className="feedgen-mode-title">Tailscale Funnel (recommended)</span>
              <span className="feedgen-mode-desc">
                Free <code>https://yourpc.your-tailnet.ts.net</code> — no domain purchase
              </span>
            </label>
            <label className={`feedgen-mode-card${homeExposure === 'own-cloudflare' ? ' active' : ''}`}>
              <input
                type="radio"
                name="home-exposure"
                value="own-cloudflare"
                checked={homeExposure === 'own-cloudflare'}
                disabled={!writable}
                onChange={() => setHomeExposure('own-cloudflare')}
              />
              <span className="feedgen-mode-title">My domain on Cloudflare</span>
              <span className="feedgen-mode-desc">You already have a hostname (e.g. feedbuilder.fema.monster)</span>
            </label>
            <label className={`feedgen-mode-card${homeExposure === 'custom' ? ' active' : ''}`}>
              <input
                type="radio"
                name="home-exposure"
                value="custom"
                checked={homeExposure === 'custom'}
                disabled={!writable}
                onChange={() => setHomeExposure('custom')}
              />
              <span className="feedgen-mode-title">Custom (advanced)</span>
              <span className="feedgen-mode-desc">Reverse proxy, VPN, or anything else — paste your HTTPS URL</span>
            </label>
          </div>
        </div>
      )}

      {mode === 'tailscale' && (
        <>
          <div className="duckdns-guide">
            <h4>Tailscale Funnel</h4>
            <ol className="duckdns-steps">
              <li>
                Install{' '}
                <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">
                  Tailscale
                </a>{' '}
                and sign in on this PC.
              </li>
              <li>
                In the Tailscale admin console, enable <strong>Funnel</strong> for your tailnet (one-time).
              </li>
              <li>
                With the API running on port 3000, run{' '}
                <code>tailscale funnel 3000</code> (or{' '}
                <code>.\scripts\start-feedgen-tailscale.ps1</code>).
              </li>
              <li>
                Copy the <code>https://…ts.net</code> URL Tailscale prints, paste below, then{' '}
                <strong>Save &amp; test</strong>.
              </li>
            </ol>
            <p className="card-hint">
              Funnel must stay running while feeds are live. Restart it after reboots.
            </p>
          </div>

          <div className="settings-field-grid duckdns-fields">
            <label>
              Tailscale Funnel URL
              <input
                className="mono"
                value={draft.publicBaseUrl ?? ''}
                placeholder="https://mypc.tail-xxxxx.ts.net"
                disabled={!writable}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    publicBaseUrl: e.target.value.trim(),
                  }))
                }
              />
            </label>
          </div>

          {settings.cloudflareLastCheckAt && (
            <p
              className={`settings-hint duckdns-status${settings.cloudflareLastOk ? ' ok' : ' err'}`}
            >
              Last check: {new Date(settings.cloudflareLastCheckAt).toLocaleString()}
              {settings.cloudflareLastMessage ? ` · ${settings.cloudflareLastMessage}` : ''}
            </p>
          )}

          {writable && tailscaleReady && (
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={syncBusy}
                onClick={() => void checkPublicUrlNow()}
              >
                {syncBusy ? 'Checking…' : 'Test connection'}
              </button>
            </div>
          )}
        </>
      )}

      {mode === 'cloudflare' && homeExposure === 'own-cloudflare' && (
        <>
          <div className="duckdns-guide">
            <h4>Cloudflare Tunnel</h4>
            <ol className="duckdns-steps">
              <li>
                Sign in at{' '}
                <a href="https://one.dash.cloudflare.com" target="_blank" rel="noreferrer">
                  Cloudflare Zero Trust
                </a>{' '}
                → <strong>Networks</strong> → <strong>Tunnels</strong> → Create a tunnel.
              </li>
              <li>
                Add a <strong>Public Hostname</strong> (e.g. <code>feeds.yourdomain.com</code>) pointing
                to <code>http://api:3000</code> in Docker or <code>http://127.0.0.1:3000</code> on your
                PC.
              </li>
              <li>
                Paste your HTTPS hostname below, then <strong>Save &amp; test</strong>.
              </li>
            </ol>
            <p className="card-hint">
              Docker: <code>.\scripts\docker-up.ps1 -Profile home</code> · Native:{' '}
              <code>.\scripts\start-feedgen-cloudflare.ps1</code> after the API is running.
            </p>
          </div>

          <div className="settings-field-grid duckdns-fields">
            <label>
              Public HTTPS URL (tunnel hostname)
              <input
                className="mono"
                value={draft.cloudflarePublicUrl ?? ''}
                disabled={!writable}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    cloudflarePublicUrl: e.target.value.trim(),
                    publicBaseUrl: e.target.value.trim().replace(/\/$/, ''),
                  }))
                }
                placeholder="https://feeds.yourdomain.com"
              />
            </label>
            <label>
              Tunnel token (Docker only — skip if cloudflared Windows service is already running)
              <input
                className="mono"
                type="password"
                autoComplete="off"
                value={cloudflareTokenInput}
                disabled={!writable}
                onChange={(e) => setCloudflareTokenInput(e.target.value)}
                placeholder={
                  settings.cloudflareTunnelTokenSet
                    ? '•••••••• (saved — leave blank to keep)'
                    : 'optional — only for Docker deploy'
                }
              />
            </label>
          </div>

          {cloudflareUrl && (
            <p className="settings-hint">
              Bluesky will use: <code>{cloudflareUrl.replace(/\/$/, '')}</code>
            </p>
          )}

          {settings.cloudflareLastCheckAt && (
            <p
              className={`settings-hint duckdns-status${settings.cloudflareLastOk ? ' ok' : ' err'}`}
            >
              Last check: {new Date(settings.cloudflareLastCheckAt).toLocaleString()}
              {settings.cloudflareLastMessage ? ` · ${settings.cloudflareLastMessage}` : ''}
            </p>
          )}
        </>
      )}

      {mode === 'duckdns' && (
        <>
          <div className="duckdns-guide">
            <h4>DuckDNS on your VPS</h4>
            <ol className="duckdns-steps">
              <li>
                Open{' '}
                <a href="https://www.duckdns.org" target="_blank" rel="noreferrer">
                  duckdns.org
                </a>{' '}
                and sign in.
              </li>
              <li>
                Create a subdomain — e.g. <code>myfeeds</code> →{' '}
                <code>myfeeds.duckdns.org</code>.
              </li>
              <li>
                Paste subdomain + token below. We update DuckDNS to this machine&apos;s public IP
                every 5 minutes.
              </li>
            </ol>
            <p className="card-hint">
              Docker VPS: <code>.\scripts\docker-up.ps1 -Profile vps</code> includes Caddy for HTTPS
              on port 443.
            </p>
          </div>

          <div className="settings-field-grid duckdns-fields">
            <label>
              DuckDNS subdomain
              <div className="duckdns-subdomain-row">
                <input
                  className="mono"
                  value={draft.duckdnsSubdomain ?? ''}
                  disabled={!writable}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      duckdnsSubdomain: e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase(),
                      publicBaseUrl: e.target.value.trim()
                        ? duckdnsPublicUrl(e.target.value)
                        : d.publicBaseUrl,
                    }))
                  }
                  placeholder="femafeeds"
                />
                <span className="duckdns-suffix">.duckdns.org</span>
              </div>
            </label>
            <label>
              DuckDNS token
              <input
                className="mono"
                type="password"
                autoComplete="off"
                value={duckdnsTokenInput}
                disabled={!writable}
                onChange={(e) => setDuckdnsTokenInput(e.target.value)}
                placeholder={
                  settings.duckdnsTokenSet
                    ? '•••••••• (saved — leave blank to keep)'
                    : 'paste token from duckdns.org'
                }
              />
            </label>
          </div>

          {duckdnsHost && (
            <p className="settings-hint">
              Public feed URL: <code>{duckdnsUrl || `https://${duckdnsHost}`}</code>
            </p>
          )}

          {settings.duckdnsLastSyncAt && (
            <p className={`settings-hint duckdns-status${settings.duckdnsLastOk ? ' ok' : ' err'}`}>
              Last sync: {new Date(settings.duckdnsLastSyncAt).toLocaleString()}
              {settings.duckdnsLastIp ? ` · IP ${settings.duckdnsLastIp}` : ''}
              {settings.duckdnsLastMessage ? ` · ${settings.duckdnsLastMessage}` : ''}
            </p>
          )}
        </>
      )}

      {showVpsOwnDomain && (
        <>
          <div className="duckdns-guide">
            <h4>Your domain on the VPS</h4>
            <p className="card-hint">
              Point an A record at your VPS IP. Docker VPS profile includes Caddy for HTTPS on port
              443. Enter the public HTTPS URL Bluesky should call.
            </p>
          </div>
          <div className="settings-field-grid">
            <label>
              Public base URL
              <input
                className="mono"
                value={draft.publicBaseUrl}
                disabled={!writable}
                onChange={(e) => setDraft((d) => ({ ...d, publicBaseUrl: e.target.value }))}
                placeholder="https://feeds.example.com"
              />
            </label>
          </div>
        </>
      )}

      {showAdvancedCustom && (
        <>
          <div className="duckdns-guide">
            <h4>Custom exposure (advanced)</h4>
            <p className="card-hint">
              You handle everything: DNS, HTTPS, port forwarding, reverse proxy, or another tunnel.
              Bluesky only needs a stable <code>https://</code> URL that reaches this API on{' '}
              <code>/xrpc/app.bsky.feed.getFeedSkeleton</code> and{' '}
              <code>/.well-known/did.json</code>.
            </p>
            <p className="card-hint">
              Works on home or VPS. No DuckDNS, Cloudflare, or Tailscale integration — paste the URL
              once it works in your browser.
            </p>
          </div>
          <div className="settings-field-grid">
            <label>
              Public base URL
              <input
                className="mono"
                value={draft.publicBaseUrl}
                disabled={!writable}
                onChange={(e) => setDraft((d) => ({ ...d, publicBaseUrl: e.target.value }))}
                placeholder="https://feeds.example.com"
              />
            </label>
          </div>
        </>
      )}

      {error && <p className="field-error">{error}</p>}

      {writable && deployTarget !== 'hosted' && (
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveDisabled}
            onClick={() => void save()}
          >
            {busy
              ? 'Saving…'
              : mode === 'cloudflare'
                ? 'Save & test connection'
                : mode === 'duckdns'
                  ? 'Save & connect DuckDNS'
                  : 'Save URL'}
          </button>
          {mode === 'cloudflare' && settings.cloudflareTunnelTokenSet && cloudflareUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={syncBusy}
                onClick={() => void checkPublicUrlNow()}
            >
              {syncBusy ? 'Checking…' : 'Test connection'}
            </button>
          )}
          {mode === 'duckdns' && settings.duckdnsTokenSet && duckdnsSlug && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={syncBusy}
              onClick={() => void syncDuckDnsNow()}
            >
              {syncBusy ? 'Syncing…' : 'Sync IP now'}
            </button>
          )}
        </div>
      )}

      <details className="feedgen-advanced">
        <summary>Advanced — publisher account &amp; policy URLs</summary>
        <div className="settings-field-grid">
          <label>
            Generator DID override (optional)
            <input
              className="mono"
              value={draft.generatorDid}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, generatorDid: e.target.value }))}
              placeholder={publisherDid ? `defaults to ${publisherDid}` : 'did:plc:…'}
            />
          </label>
          <p className="card-hint">
            Leave empty to publish feeds under your signed-in Bluesky account.
          </p>
          <label>
            Privacy policy URL (optional)
            <input
              value={draft.privacyPolicyUrl ?? ''}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, privacyPolicyUrl: e.target.value }))}
              placeholder="https://…"
            />
          </label>
          <label>
            Terms of service URL (optional)
            <input
              value={draft.termsOfServiceUrl ?? ''}
              disabled={!writable}
              onChange={(e) => setDraft((d) => ({ ...d, termsOfServiceUrl: e.target.value }))}
              placeholder="https://…"
            />
          </label>
        </div>
        {writable && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save advanced settings'}
          </button>
        )}
      </details>

      {saved && <p className="settings-hint">Saved.</p>}
    </div>
  )
}

function EnrichmentForm({
  settings,
  onSave,
}: {
  settings: EnrichmentSettings
  onSave: (patch: Partial<EnrichmentSettings>) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  const toggle = async (key: keyof EnrichmentSettings, value: boolean) => {
    setBusy(true)
    try {
      await onSave({ [key]: value })
    } finally {
      setBusy(false)
    }
  }

  const setNumber = async (key: keyof EnrichmentSettings, raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return
    setBusy(true)
    try {
      await onSave({ [key]: n })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`enrichment-form ${busy ? 'busy' : ''}`}>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.resolveLabelerLabels}
          onChange={(e) => void toggle('resolveLabelerLabels', e.target.checked)}
        />
        Resolve labeler labels at ingest
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.labelStreamEnabled}
          onChange={(e) => void toggle('labelStreamEnabled', e.target.checked)}
        />
        Label stream (real-time WebSocket)
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.labelRefreshEnabled}
          onChange={(e) => void toggle('labelRefreshEnabled', e.target.checked)}
        />
        Label refresh sweeper enabled
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.enrichAuthors}
          onChange={(e) => void toggle('enrichAuthors', e.target.checked)}
        />
        Enrich author profiles
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.trackEngagement}
          onChange={(e) => void toggle('trackEngagement', e.target.checked)}
        />
        Track engagement (likes, reposts, …)
      </label>
      <div className="settings-number-row">
        <label>
          Label re-check interval (minutes)
          <input
            type="number"
            min={1}
            value={settings.labelRefreshIntervalMinutes}
            onChange={(e) => void setNumber('labelRefreshIntervalMinutes', e.target.value)}
          />
        </label>
        <label>
          Watch posts for (days)
          <input
            type="number"
            min={1}
            value={settings.labelRefreshMaxAgeDays}
            onChange={(e) => void setNumber('labelRefreshMaxAgeDays', e.target.value)}
          />
        </label>
        <label>
          Batch size per sweep
          <input
            type="number"
            min={1}
            value={settings.labelRefreshBatchSize}
            onChange={(e) => void setNumber('labelRefreshBatchSize', e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
