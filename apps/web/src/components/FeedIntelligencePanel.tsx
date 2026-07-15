import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FeedConfig } from '@cfb/core-types'

type SignalType = 'hashtag' | 'mention' | 'domain' | 'ngram' | 'engaged_account'

interface Suggestion {
  signalType: SignalType
  value: string
  poolCount: number
  poolFrequency: number
  firehoseFrequency: number
  lift: number
  confidence: number
}

interface ProfileInfo {
  handle: string
  displayName?: string
  avatarUrl?: string
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  hashtag: 'Hashtags',
  mention: 'Mentions',
  domain: 'Domains',
  ngram: 'Keywords & Phrases',
  engaged_account: 'Engaged Accounts',
}

const SIGNAL_DESCRIPTIONS: Record<SignalType, string> = {
  hashtag: 'Hashtags that appear in your pool posts more frequently than on the general firehose. Discovering new relevant hashtags can help expand your ingest filters.',
  mention: 'Accounts that are @mentioned in your pool posts. These may be relevant voices in your topic area worth adding to author lists.',
  domain: 'Link domains shared in your pool posts. Domains that appear frequently may indicate key sources for your topic.',
  ngram: 'Words and phrases (bigrams/trigrams) that appear frequently in your pool post text. These can reveal topic patterns you haven\'t explicitly captured in your keyword filters.',
  engaged_account: 'Accounts that your pool authors reply to or quote most often. High engagement with an account suggests they\'re a key voice in your topic — consider adding them to your author lists or scouts.',
}

function SignalIcon({ type }: { type: SignalType }) {
  switch (type) {
    case 'hashtag':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18"/></svg>
    case 'mention':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>
    case 'domain':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
    case 'ngram':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    case 'engaged_account':
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
  }
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 32,
        height: 18,
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--accent, #3b82f6)' : 'var(--border, #444)',
        transition: 'background 0.15s',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 16 : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s',
      }} />
    </button>
  )
}

function InfoPopover({ type, onClose }: { type: SignalType; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '1rem 1.25rem', maxWidth: '360px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <SignalIcon type={type} />
          <strong>{SIGNAL_LABELS[type]}</strong>
        </div>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {SIGNAL_DESCRIPTIONS[type]}
        </p>
      </div>
    </div>
  )
}

const SIGNAL_ORDER: SignalType[] = ['hashtag', 'ngram', 'domain', 'mention', 'engaged_account']

interface Props {
  projectId: string
  feedId?: string
  feeds?: FeedConfig[]
}

export function FeedIntelligencePanel({ projectId, feedId, feeds }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [profiles, setProfiles] = useState<Map<string, ProfileInfo>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sensitivity, setSensitivity] = useState(2)
  const [filterType, setFilterType] = useState<SignalType | 'all'>('all')
  const [hideUnigrams, setHideUnigrams] = useState(true)
  const [hideCaptured, setHideCaptured] = useState(true)
  const [scope, setScope] = useState<'project' | 'feed'>(feedId ? 'feed' : 'project')
  const [selectedFeedId, setSelectedFeedId] = useState<string | undefined>(feedId)
  const [meta, setMeta] = useState<{ windowDays: number; sampleRate: number } | null>(null)
  const [actionStatus, setActionStatus] = useState<string | null>(null)
  const [infoPopover, setInfoPopover] = useState<SignalType | null>(null)

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getIntelligenceSuggestions(projectId, {
        feedId: scope === 'feed' ? selectedFeedId : undefined,
        minConfidence: 0,
        limit: 200,
        type: filterType === 'all' ? undefined : filterType,
        minPoolCount: sensitivity,
        hideCaptured,
      })
      setSuggestions(res.suggestions as Suggestion[])
      setMeta(res.meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suggestions')
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [projectId, scope, selectedFeedId, sensitivity, filterType, hideCaptured])

  useEffect(() => { void loadSuggestions() }, [loadSuggestions])

  // Resolve engaged account / mention DIDs to profiles
  useEffect(() => {
    const dids = suggestions
      .filter((s) => s.signalType === 'engaged_account' || s.signalType === 'mention')
      .map((s) => s.value)
      .filter((d) => !profiles.has(d))
    if (dids.length === 0) return
    void api.resolveAuthorProfiles(dids).then((res) => {
      setProfiles((prev) => {
        const next = new Map(prev)
        for (const m of res.members) {
          next.set(m.did, {
            handle: m.handle ?? m.did,
            displayName: m.displayName ?? undefined,
            avatarUrl: m.avatarUrl ?? undefined,
          })
        }
        return next
      })
    }).catch(() => {})
  }, [suggestions])

  const handleDismiss = async (s: Suggestion) => {
    await api.dismissIntelligenceSuggestion(projectId, s.signalType, s.value)
    setSuggestions((prev) => prev.filter((x) => !(x.signalType === s.signalType && x.value === s.value)))
  }

  const handleFlush = async () => {
    setActionStatus('Flushing…')
    try {
      const res = await api.flushIntelligence()
      setActionStatus(`Flushed ${res.poolFlushed + res.firehoseFlushed} signals`)
      void loadSuggestions()
    } catch (e) {
      setActionStatus(e instanceof Error ? e.message : 'Flush failed')
    }
  }

  const handleBackfill = async () => {
    setActionStatus('Sampling jetstream (30s) + scanning pool…')
    try {
      const res = await api.backfillIntelligence({ projectId })
      setActionStatus(`Done: ${res.firehosePostsSampled} firehose posts sampled, ${res.postsProcessed} pool posts → ${res.projectSignalsFlushed} signals`)
      void loadSuggestions()
    } catch (e) {
      setActionStatus(e instanceof Error ? e.message : 'Backfill failed')
    }
  }

  // Apply client-side unigram filter
  const filtered = hideUnigrams
    ? suggestions.filter((s) => s.signalType !== 'ngram' || s.value.includes(' '))
    : suggestions

  const grouped = SIGNAL_ORDER
    .map((type) => ({
      type,
      items: filtered.filter((s) => s.signalType === type),
    }))
    .filter((g) => g.items.length > 0)

  const totalCount = filtered.length

  return (
    <div className="intelligence-panel">
      <div className="intelligence-header">
        <h3>Feed Intelligence</h3>
        <p className="card-hint">
          Patterns in your {scope === 'feed' ? 'feed' : 'pool'} that appear more often than the firehose average.
        </p>
      </div>

      {/* Scope selector */}
      {!feedId && feeds && feeds.length > 0 && (
        <div className="intelligence-scope">
          <div className="intelligence-scope-row">
            <button
              type="button"
              className={`btn btn-sm ${scope === 'project' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setScope('project'); setSelectedFeedId(undefined) }}
            >
              Project pool
            </button>
            <button
              type="button"
              className={`btn btn-sm ${scope === 'feed' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setScope('feed'); setSelectedFeedId(feeds[0]?.feedId) }}
            >
              Feed level
            </button>
            {scope === 'feed' && (
              <select
                className="input input-sm"
                value={selectedFeedId ?? ''}
                onChange={(e) => setSelectedFeedId(e.target.value)}
              >
                {feeds.map((f) => (
                  <option key={f.feedId} value={f.feedId}>{f.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Controls row */}
      <div className="intelligence-controls">
        <div className="intelligence-slider">
          <label className="field-label">Min hits: {sensitivity}</label>
          <input
            type="range"
            min={2}
            max={20}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
          />
        </div>
        <div className="intelligence-filter">
          <label className="field-label">Type</label>
          <select
            className="input input-sm"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as SignalType | 'all')}
          >
            <option value="all">All</option>
            {SIGNAL_ORDER.map((t) => (
              <option key={t} value={t}>{SIGNAL_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <label className="intelligence-toggle">
          <ToggleSwitch checked={hideUnigrams} onChange={setHideUnigrams} />
          <span className="field-label">Hide single words</span>
        </label>
        <label className="intelligence-toggle">
          <ToggleSwitch checked={hideCaptured} onChange={setHideCaptured} />
          <span className="field-label">Hide already captured</span>
        </label>
      </div>

      {/* Actions */}
      <div className="intelligence-actions">
        <button type="button" className="btn btn-sm btn-secondary" onClick={handleFlush}>
          Flush Now
        </button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={handleBackfill}>
          Backfill from Pool
        </button>
        {actionStatus && <span className="card-hint">{actionStatus}</span>}
      </div>

      {/* Results */}
      {loading && <div className="empty-state">Loading…</div>}
      {error && <div className="empty-state error-text">{error}</div>}

      {!loading && !error && totalCount === 0 && (
        <div className="empty-state">
          No suggestions yet. Click "Backfill from Pool" to analyze existing posts, or wait for ingest to accumulate data.
        </div>
      )}

      {!loading && totalCount > 0 && (
        <div className="intelligence-results">
          <p className="card-hint">{totalCount} suggestion{totalCount !== 1 ? 's' : ''}</p>
          {grouped.map((group) => (
            <div key={group.type} className="intelligence-group">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <SignalIcon type={group.type} /> {SIGNAL_LABELS[group.type]}
                <button
                  type="button"
                  onClick={() => setInfoPopover(group.type)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', opacity: 0.6, padding: '0 0.2rem',
                    display: 'inline-flex', alignItems: 'center',
                  }}
                  title="What is this?"
                >
                  <InfoIcon />
                </button>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {group.items.slice(0, 20).map((s) => (
                  <SuggestionCard key={`${s.signalType}-${s.value}`} suggestion={s} onDismiss={handleDismiss} profiles={profiles} />
                ))}
                {group.items.length > 20 && (
                  <span className="card-hint">+{group.items.length - 20} more</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <footer className="intelligence-footer">
          <span className="card-hint">
            Window: {meta.windowDays}d · Sample: 1:{meta.sampleRate}
          </span>
        </footer>
      )}

      {infoPopover && <InfoPopover type={infoPopover} onClose={() => setInfoPopover(null)} />}
    </div>
  )
}

function SuggestionCard({ suggestion: s, onDismiss, profiles }: { suggestion: Suggestion; onDismiss: (s: Suggestion) => void; profiles: Map<string, ProfileInfo> }) {
  const isAccount = s.signalType === 'engaged_account' || s.signalType === 'mention'
  const profile = isAccount ? profiles.get(s.value) : undefined
  const bskyUrl = profile ? `https://bsky.app/profile/${profile.handle}` : null

  const content = isAccount ? (
    <a
      href={bskyUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
    >
      {profile?.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt=""
          style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--border)', flexShrink: 0 }} />
      )}
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile ? `@${profile.handle}` : s.value.replace('did:plc:', '').slice(0, 12) + '…'}
      </span>
      {profile?.displayName && (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.displayName}
        </span>
      )}
    </a>
  ) : (
    <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
      {s.signalType === 'hashtag' ? `#${s.value}` : s.value}
    </span>
  )

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.5rem 0.75rem',
      borderRadius: '6px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      fontSize: '0.85rem',
    }}>
      {content}
      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {s.poolCount} hits{s.firehoseFrequency > 0 ? ` · ${s.lift.toFixed(1)}x lift` : ' · unique'}
      </span>
      <button
        type="button"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          opacity: 0.4,
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '0 0.2rem',
          color: 'var(--text-muted)',
        }}
        title="Dismiss"
        onClick={() => onDismiss(s)}
      >
        &times;
      </button>
    </div>
  )
}
