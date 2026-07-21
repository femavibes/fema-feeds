import { useEffect, useMemo, useState } from 'react'

import type { FeedConfig, L2Expr, AuthorFairnessMode, ContentSignals, EngagementWeights, MediaBonus, RatioSignals, SortTuning, DecayMode } from '@cfb/core-types'

import { ToggleRow } from '../ToggleRow'
import { SortFormulaBuilder } from './SortFormulaBuilder'
import {
  DEFAULT_ENGAGEMENT_WEIGHTS,
  DEFAULT_SORT_TUNING,
  SORT_MODE_OPTIONS,
  applySortMode,
  applyTuning,
  detectEngagementWeights,
  detectSortMode,
  engagementExpr,
  engagementFormulaLabel,
  sortModeBadge,
  type SortMode,
} from '../../lib/feed-sorting'
import { fieldLabel } from '../../lib/l2-form'
import { FORMULA_FIELDS } from '../../lib/formula-parser'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  layout?: 'main' | 'sidebar'
}

const ENGAGEMENT_SIGNALS: { key: keyof EngagementWeights; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'replies', label: 'Replies' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'audienceLikes', label: 'Audience likes' },
  { key: 'audienceReposts', label: 'Audience reposts' },
]

const MEDIA_SIGNALS: { key: keyof MediaBonus; label: string }[] = [
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
  { key: 'linkCard', label: 'Link card' },
]

const CONTENT_SIGNALS: { key: keyof ContentSignals; label: string; hint: string }[] = [
  { key: 'authorFollowers', label: 'Author followers', hint: 'Positive = boost reach, negative = demote big accounts' },
  { key: 'authorPosts', label: 'Author posts', hint: 'Positive = boost prolific posters, negative = prefer casual' },
  { key: 'textLength', label: 'Text length', hint: 'Positive = boost long posts, negative = prefer short' },
  { key: 'hashtagCount', label: 'Hashtag count', hint: 'Negative = penalize hashtag spam' },
  { key: 'mentionCount', label: 'Mention count', hint: 'Positive = boost conversational posts' },
  { key: 'linkCount', label: 'Link count', hint: 'Positive = boost link-heavy, negative = demote' },
  { key: 'altTextBonus', label: 'Alt text (images)', hint: 'Positive = reward accessibility' },
  { key: 'rootPostBonus', label: 'Root post bonus', hint: 'Boost original posts (not replies/quotes) — future' },
  { key: 'replyBonus', label: 'Reply bonus', hint: 'Boost replies/threads — future' },
  { key: 'quotePostBonus', label: 'Quote post bonus', hint: 'Boost quote posts — future' },
]

const RATIO_SIGNALS: { key: keyof RatioSignals; label: string; hint: string }[] = [
  { key: 'engagementRate', label: 'Engagement rate', hint: '(likes+reposts)/(followers+1) — reach-normalized' },
  { key: 'replyRatio', label: 'Reply ratio', hint: 'replies/(likes+1) — discussion detector' },
  { key: 'quoteRatio', label: 'Quote ratio', hint: 'quotes/(likes+1) — quotability signal' },
]

const AUTHOR_FAIRNESS_OPTIONS: { value: AuthorFairnessMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No equalization' },
  { value: 'log', label: 'Log (gentle)', hint: 'Slight boost to small accounts' },
  { value: 'sqrt', label: 'Sqrt (moderate)', hint: 'Strong equalization' },
  { value: 'sigmoid', label: 'Sigmoid (aggressive)', hint: 'Heavy anti-megaphone' },
]

function SignalRows({
  signals,
  weights,
  onChange,
  disabled,
}: {
  signals: { key: string; label: string }[]
  weights: EngagementWeights
  onChange: (key: string, signal: { enabled: boolean; weight: number }) => void
  disabled?: boolean
}) {
  return (
    <>
      {signals.map((sig) => {
        const signal = (weights as unknown as Record<string, { enabled: boolean; weight: number }>)[sig.key] ?? { enabled: false, weight: 1 }
        return (
          <div key={sig.key} className="feed-sorting-signal-row">
            <ToggleRow
              label={sig.label}
              hint=""
              checked={signal.enabled}
              onChange={(on) => onChange(sig.key, { ...signal, enabled: on })}
              ariaLabel={`Include ${sig.label.toLowerCase()}`}
              disabled={disabled}
            />
            <label className="feed-sorting-weight-input">
              {signal.enabled ? (
                <>
                  <span className="feed-sorting-weight-label">×</span>
                  <input
                    type="number"
                    
                    step="1"
                    value={signal.weight}
                    disabled={disabled}
                    onChange={(e) => {
                      const w = parseInt(e.target.value) || 0
                      onChange(sig.key, { ...signal, weight: w })
                    }}
                  />
                </>
              ) : null}
            </label>
          </div>
        )
      })}
    </>
  )
}

function TuningSection({
  tuning,
  onChange,
  showMediaBonus,
  showAuthorFairness,
  showFreshnessFloor,
  showContentSignals,
  disabled,
}: {
  tuning: SortTuning
  onChange: (next: SortTuning) => void
  showMediaBonus: boolean
  showAuthorFairness: boolean
  showFreshnessFloor: boolean
  showContentSignals: boolean
  disabled?: boolean
}) {
  return (
    <fieldset className="feed-sorting-tuning-fields" disabled={disabled}>
      <p className="sidebar-block-title">Tuning</p>
      <label className="l2-inspector-field">
        Time decay
        <select
          value={tuning.decayMode ?? 'none'}
          onChange={(e) => onChange({ ...tuning, decayMode: e.target.value as DecayMode })}
        >
          <option value="none">Off</option>
          <option value="halflife">Half-life (gentle)</option>
          <option value="exponential">Exponential (aggressive)</option>
          <option value="rate">Engagement rate (per-hour)</option>
        </select>
        {(tuning.decayMode === 'halflife' || tuning.decayMode === 'exponential') && (
          <input
            type="number"
            min="1"
            step="1"
            value={tuning.decayHalfLifeHours}
            onChange={(e) => onChange({ ...tuning, decayHalfLifeHours: Math.max(1, parseInt(e.target.value) || 24) })}
          />
        )}
        {(!tuning.decayMode || tuning.decayMode === 'none') && (
          <span className="card-hint">No time decay applied.</span>
        )}
        {tuning.decayMode === 'halflife' && (
          <span className="card-hint">Gentle. Score halves every N hours — a viral post still stays visible for days.</span>
        )}
        {tuning.decayMode === 'exponential' && (
          <span className="card-hint">Aggressive. Score compounds down — halves every N hours no matter how viral. Set N=24 for strong daily decay.</span>
        )}
        {tuning.decayMode === 'rate' && (
          <span className="card-hint">Divides score by age in hours. Rewards posts gaining engagement fast — a post with 100 likes at 2h beats 1000 likes at 200h.</span>
        )}
      </label>
      <label className="l2-inspector-field">
        Editor score boost
        <input
          type="number"
          min="0"
          step="100"
          value={tuning.editorScoreWeight}
          onChange={(e) => onChange({ ...tuning, editorScoreWeight: Math.max(0, parseInt(e.target.value) || 0) })}
        />
        <span className="card-hint">0 = off. Multiplies editor_score from Score nodes before adding.</span>
      </label>

      {showFreshnessFloor && (
        <label className="l2-inspector-field">
          Max post age (hours)
          <input
            type="number"
            min="0"
            step="1"
            value={tuning.maxAgeHours}
            onChange={(e) => onChange({ ...tuning, maxAgeHours: Math.max(0, parseInt(e.target.value) || 0) })}
          />
          <span className="card-hint">0 = no limit. Posts older than this trend toward score 0.</span>
        </label>
      )}

      {showAuthorFairness && (
        <label className="l2-inspector-field">
          Author fairness
          <select
            value={tuning.authorFairness}
            onChange={(e) => onChange({ ...tuning, authorFairness: e.target.value as AuthorFairnessMode })}
          >
            {AUTHOR_FAIRNESS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} — {opt.hint}</option>
            ))}
          </select>
          <span className="card-hint">Divide score by a function of follower count to equalize reach.</span>
        </label>
      )}

      {showMediaBonus && (
        <>
          <p className="sidebar-block-title" style={{ marginTop: '0.5rem' }}>Media Bonus</p>
          <div className="feed-sorting-signals">
            {MEDIA_SIGNALS.map((sig) => {
              const signal = tuning.mediaBonus[sig.key]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleRow
                    label={sig.label}
                    hint=""
                    checked={signal.enabled}
                    onChange={(on) => onChange({
                      ...tuning,
                      mediaBonus: { ...tuning.mediaBonus, [sig.key]: { ...signal, enabled: on } },
                    })}
                    ariaLabel={`Boost ${sig.label.toLowerCase()} posts`}
                  />
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">+</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = Math.max(0, parseInt(e.target.value) || 0)
                            onChange({
                              ...tuning,
                              mediaBonus: { ...tuning.mediaBonus, [sig.key]: { ...signal, weight: w } },
                            })
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showFreshnessFloor && (
        <>
          <label className="l2-inspector-field">
            Score cap
            <input
              type="number"
              min="0"
              step="10"
              value={tuning.scoreCap}
              onChange={(e) => onChange({ ...tuning, scoreCap: Math.max(0, parseInt(e.target.value) || 0) })}
            />
            <span className="card-hint">0 = no cap. Maximum score any post can have.</span>
          </label>
          <label className="l2-inspector-field">
            Score floor
            <input
              type="number"
              step="1"
              value={tuning.scoreFloor}
              onChange={(e) => onChange({ ...tuning, scoreFloor: parseInt(e.target.value) || 0 })}
            />
            <span className="card-hint">0 = off. Minimum score (prevents going negative).</span>
          </label>
        </>
      )}

      {showContentSignals && (
        <>
          <p className="sidebar-block-title" style={{ marginTop: '0.5rem' }}>Content Signals</p>
          <div className="feed-sorting-signals">
            {CONTENT_SIGNALS.map((sig) => {
              const signal = tuning.contentSignals[sig.key]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleRow
                    label={sig.label}
                    hint=""
                    checked={signal.enabled}
                    onChange={(on) => onChange({
                      ...tuning,
                      contentSignals: { ...tuning.contentSignals, [sig.key]: { ...signal, enabled: on } },
                    })}
                    ariaLabel={sig.hint}
                  />
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">×</span>
                        <input
                          type="number"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = parseInt(e.target.value) || 0
                            onChange({
                              ...tuning,
                              contentSignals: { ...tuning.contentSignals, [sig.key]: { ...signal, weight: w } },
                            })
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}
          </div>
        </>
      )}
    </fieldset>
  )
}

export function FeedSortingPanel({ draft, onChange, layout = 'sidebar' }: Props) {
  const detectedMode = useMemo(() => detectSortMode(draft.rank), [draft.rank])
  const [explicitMode, setExplicitMode] = useState<SortMode | null>(null)
  const mode = explicitMode ?? detectedMode
  const detectedWeights = useMemo(
    () => draft.rank?.sortKey ? detectEngagementWeights(draft.rank.sortKey) : DEFAULT_ENGAGEMENT_WEIGHTS,
    [draft.rank?.sortKey],
  )

  const [engagementWeights, setEngagementWeights] = useState<EngagementWeights>(detectedWeights)
  const [tuning, setTuning] = useState<SortTuning>(
    draft.rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...draft.rank.tuning } : DEFAULT_SORT_TUNING,
  )

  useEffect(() => {
    setEngagementWeights(detectedWeights)
  }, [draft.feedId, detectedWeights])

  useEffect(() => {
    setTuning(draft.rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...draft.rank.tuning } : DEFAULT_SORT_TUNING)
  }, [draft.feedId])


  const [copied, setCopied] = useState(false)

  const copyExpr = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const selectMode = (next: SortMode) => {
    setExplicitMode(next)
    if (next === 'builder') return
    if (next === 'engagement') {
      onChange((prev) => applySortMode(prev, next, engagementWeights, tuning))
      return
    }
    if (next === 'custom') {
      onChange((prev) => {
        if (prev.rank?.sortKey) return prev
        return { ...prev, rank: { sortKey: { type: 'field', field: 'editor_score' } } }
      })
      return
    }
    onChange((prev) => applySortMode(prev, next, undefined, DEFAULT_SORT_TUNING))
  }

  const updateWeights = (next: EngagementWeights) => {
    const anyEnabled = Object.values(next).some((s) => s.enabled)
    const safe = anyEnabled ? next : { ...next, likes: { ...next.likes, enabled: true } }
    setEngagementWeights(safe)
    if (mode === 'engagement') {
      onChange((prev) => applySortMode(prev, 'engagement', safe, tuning))
    } else {
      rebuildCustomExpr(safe, tuning)
    }
  }

  const updateTuning = (next: SortTuning) => {
    setTuning(next)
    if (mode === 'engagement') {
      onChange((prev) => {
        const updated = applySortMode(prev, 'engagement', engagementWeights, next)
        return { ...updated, rank: { ...updated.rank, tuning: next } }
      })
    } else {
      rebuildCustomExpr(engagementWeights, next)
    }
  }

  const rebuildCustomExpr = (weights: EngagementWeights, t: SortTuning) => {
    const expr = applyTuning(engagementExpr(weights), t)
    onChange((prev) => ({ ...prev, rank: { ...prev.rank, sortKey: expr, tuning: t } }))
  }

  const isMain = layout === 'main'

  return (
    <div className={`feed-sorting-panel${isMain ? ' feed-sorting-panel-main' : ''}`}>
      {!isMain ? (
        <p className="card-hint feed-sorting-hint">
          Controls feed skeleton order — higher scores appear first. Autosaves to your draft; use{' '}
          <strong>Update</strong> to go live.
        </p>
      ) : null}

      <div className="option-toggle-list feed-sorting-modes" role="radiogroup" aria-label="Sort mode">
        {SORT_MODE_OPTIONS.map((opt) => (
          <ToggleRow
            key={opt.id}
            label={opt.label}
            hint={opt.hint}
            checked={mode === opt.id}
            onChange={(on) => { if (on) selectMode(opt.id) }}
            ariaLabel={`Sort by ${opt.label}`}
          />
        ))}
      </div>

      {mode === 'engagement' && (
        <div className="feed-sorting-tuning">
          <div className="feed-sorting-signals">
            <p className="sidebar-block-title">Engagement Signals & Weights</p>
            <SignalRows
              signals={ENGAGEMENT_SIGNALS}
              weights={engagementWeights}
              onChange={(key, signal) => updateWeights({ ...engagementWeights, [key]: signal })}
            />
          </div>

          <TuningSection
            tuning={tuning}
            onChange={updateTuning}
            showMediaBonus={false}
            showAuthorFairness={false}
            showFreshnessFloor={false}
            showContentSignals={false}
          />

          <div className="feed-sorting-formula-display">
            <span className="feed-sorting-formula-label">Formula:</span>
            <code className="feed-sorting-formula">{engagementFormulaLabel(engagementWeights, tuning)}</code>
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="feed-sorting-tuning">
          <div className="feed-sorting-signals">
            <p className="sidebar-block-title">Engagement Signals & Weights</p>
            <SignalRows
              signals={ENGAGEMENT_SIGNALS}
              weights={engagementWeights}
              onChange={(key, signal) => {
                const next = { ...engagementWeights, [key]: signal }
                setEngagementWeights(next)
                rebuildCustomExpr(next, tuning)
              }}
            />

            <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Media Bonus</p>
            {MEDIA_SIGNALS.map((sig) => {
              const signal = tuning.mediaBonus[sig.key]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleRow
                    label={sig.label}
                    hint=""
                    checked={signal.enabled}
                    onChange={(on) => {
                      const next = { ...tuning, mediaBonus: { ...tuning.mediaBonus, [sig.key]: { ...signal, enabled: on } } }
                      setTuning(next)
                      rebuildCustomExpr(engagementWeights, next)
                    }}
                    ariaLabel={`Boost ${sig.label.toLowerCase()} posts`}
                  />
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">+</span>
                        <input
                          type="number"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = parseInt(e.target.value) || 0
                            const next = { ...tuning, mediaBonus: { ...tuning.mediaBonus, [sig.key]: { ...signal, weight: w } } }
                            setTuning(next)
                            rebuildCustomExpr(engagementWeights, next)
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}

            <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Content Signals</p>
            {CONTENT_SIGNALS.map((sig) => {
              const signal = tuning.contentSignals[sig.key]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleRow
                    label={sig.label}
                    hint=""
                    checked={signal.enabled}
                    onChange={(on) => {
                      const next = { ...tuning, contentSignals: { ...tuning.contentSignals, [sig.key]: { ...signal, enabled: on } } }
                      setTuning(next)
                      rebuildCustomExpr(engagementWeights, next)
                    }}
                    ariaLabel={sig.hint}
                  />
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">×</span>
                        <input
                          type="number"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = parseInt(e.target.value) || 0
                            const next = { ...tuning, contentSignals: { ...tuning.contentSignals, [sig.key]: { ...signal, weight: w } } }
                            setTuning(next)
                            rebuildCustomExpr(engagementWeights, next)
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}

            <p className="sidebar-block-title" style={{ marginTop: '0.75rem' }}>Engagement Ratios</p>
            {RATIO_SIGNALS.map((sig) => {
              const signal = tuning.ratioSignals[sig.key as keyof typeof tuning.ratioSignals]
              return (
                <div key={sig.key} className="feed-sorting-signal-row">
                  <ToggleRow
                    label={sig.label}
                    hint=""
                    checked={signal.enabled}
                    onChange={(on) => {
                      const next = { ...tuning, ratioSignals: { ...tuning.ratioSignals, [sig.key]: { ...signal, enabled: on } } }
                      setTuning(next)
                      rebuildCustomExpr(engagementWeights, next)
                    }}
                    ariaLabel={sig.hint}
                  />
                  <label className="feed-sorting-weight-input">
                    {signal.enabled ? (
                      <>
                        <span className="feed-sorting-weight-label">×</span>
                        <input
                          type="number"
                          step="1"
                          value={signal.weight}
                          onChange={(e) => {
                            const w = parseInt(e.target.value) || 0
                            const next = { ...tuning, ratioSignals: { ...tuning.ratioSignals, [sig.key]: { ...signal, weight: w } } }
                            setTuning(next)
                            rebuildCustomExpr(engagementWeights, next)
                          }}
                        />
                      </>
                    ) : null}
                  </label>
                </div>
              )
            })}
          </div>

          <TuningSection
            tuning={tuning}
            onChange={(next) => { setTuning(next); rebuildCustomExpr(engagementWeights, next) }}
            showMediaBonus={false}
            showAuthorFairness
            showFreshnessFloor
            showContentSignals={false}
          />

          <div className="feed-sorting-formula-display">
            <span className="feed-sorting-formula-label">Formula:</span>
            <code className="feed-sorting-formula">{engagementFormulaLabel(engagementWeights, tuning)}</code>
          </div>

          <div className="feed-sorting-custom-section">
            <div className="feed-sorting-custom-header">
              <p className="sidebar-block-title">Raw expression (advanced)</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => copyExpr(JSON.stringify(draft.rank?.sortKey ?? { type: 'field', field: 'editor_score' }, null, 2))}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <textarea
              className="feed-sorting-custom-expr"
              rows={6}
              value={JSON.stringify(draft.rank?.sortKey ?? { type: 'field', field: 'editor_score' }, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value) as L2Expr
                  if (parsed.type) {
                    onChange((prev) => ({ ...prev, rank: { ...prev.rank, sortKey: parsed } }))
                  }
                } catch { /* ignore parse errors while typing */ }
              }}
            />
            <p className="card-hint">Available fields: {Object.keys(FORMULA_FIELDS).join(', ')}</p>
          </div>
        </div>
      )}


      {mode === 'builder' && (
        <div className="feed-sorting-tuning">
          <SortFormulaBuilder
            draft={draft}
            onChange={(expr) => onChange((prev) => ({ ...prev, rank: { ...prev.rank, sortKey: expr } }))}
          />
        </div>
      )}

      {!isMain ? (
        <div className="feed-sorting-status">
          <span className="badge badge-on">{sortModeBadge(mode, engagementWeights)}</span>
          <span className="card-hint feed-sorting-status-hint">
            {mode === 'chronological'
                ? 'Matches post indexed time when candidates are built.'
                : 'Formula applied when candidates are rebuilt after Update live.'}
          </span>
        </div>
      ) : null}
    </div>
  )
}
