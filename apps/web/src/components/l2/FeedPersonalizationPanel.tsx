import { useState } from 'react'
import type { FeedConfig, L2Expr, NativePersonalizationConfig } from '@cfb/core-types'
import { DEFAULT_PERSONALIZATION, PERSONALIZATION_DEPTH_DEFAULT, PERSONALIZATION_DEPTH_MAX, resolveSuppressServed } from '@cfb/core-types'
import { clearPersonalizationFormulaPackRef } from '../../lib/feed-personalization'
import { PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { ToggleRow } from '../ToggleRow'
import { SortFormulaBuilder } from './SortFormulaBuilder'
import {
  PERSONALIZATION_FIELD_GROUPS,
  PERSONALIZATION_TEMPLATES,
} from './feed-personalization-presets'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

type PersonalizationMode = 'toggles' | 'formula'

export function FeedPersonalizationPanel({ draft, onChange }: Props) {
  const config = draft.personalization ?? DEFAULT_PERSONALIZATION
  const suppressServed = resolveSuppressServed(config) ?? DEFAULT_PERSONALIZATION.suppressServed!
  const [mode, setMode] = useState<PersonalizationMode>(
    config.formulaEnabled ? 'formula' : 'toggles',
  )
  const [showFieldRef, setShowFieldRef] = useState(false)

  const update = (patch: Partial<NativePersonalizationConfig>) => {
    onChange({ ...draft, personalization: { ...config, ...patch } })
  }

  const handleModeChange = (next: PersonalizationMode) => {
    setMode(next)
    if (next === 'formula') {
      update({ formulaEnabled: true })
    } else {
      update({ formulaEnabled: false })
    }
  }

  const handleFormulaChange = (expr: L2Expr) => {
    onChange(
      clearPersonalizationFormulaPackRef({
        ...draft,
        personalization: { ...config, formula: expr, formulaEnabled: true },
      }),
    )
  }

  return (
    <div className="feed-personalization-panel">
      {/* Mode toggle */}
      <div className="option-toggle-list feed-personalization-modes" role="radiogroup" aria-label="Personalization mode">
        <ToggleRow
          label="Toggles"
          hint="Simple on/off switches for common personalization behaviors."
          checked={mode === 'toggles'}
          onChange={(on) => { if (on) handleModeChange('toggles') }}
          ariaLabel="Toggle-based personalization"
        />
        <ToggleRow
          label="Formula builder"
          hint="Write a math formula using viewer signals (base_score, is_followed, affinity, etc.)."
          checked={mode === 'formula'}
          onChange={(on) => { if (on) handleModeChange('formula') }}
          ariaLabel="Formula builder personalization"
        />
      </div>

      <section className="feed-personalization-section feed-personalization-serve-section">
        <label className="feed-personalization-field feed-personalization-field--inline">
          Personalization depth
          <input
            type="number"
            step="50"
            min="50"
            max={PERSONALIZATION_DEPTH_MAX}
            value={config.depth ?? PERSONALIZATION_DEPTH_DEFAULT}
            onChange={(e) => {
              const raw = parseInt(e.target.value) || PERSONALIZATION_DEPTH_DEFAULT
              update({ depth: Math.max(50, Math.min(raw, PERSONALIZATION_DEPTH_MAX)) })
            }}
          />
        </label>
        <p className="card-hint feed-personalization-serve-hint">
          How many top-sorted candidates the formula can reorder on each open. Higher depth reaches
          never-served posts deeper in the pool; lower depth is faster.
        </p>
      </section>

      {mode === 'toggles' && (
        <div className="feed-personalization-toggles">
          <section className="feed-personalization-section">
            <ToggleRow
              label="Boost followed accounts"
              hint="Posts from accounts the viewer follows get a score boost."
              checked={config.boostFollowed?.enabled ?? false}
              onChange={(on) => update({ boostFollowed: { ...config.boostFollowed!, enabled: on } })}
              ariaLabel="Boost followed accounts"
            />
            {config.boostFollowed?.enabled && (
              <label className="feed-personalization-field">
                Factor
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={config.boostFollowed.factor}
                  onChange={(e) => update({ boostFollowed: { enabled: true, factor: parseFloat(e.target.value) || 1.3 } })}
                />
                <span className="card-hint">1.0 = no boost, 2.0 = double score</span>
              </label>
            )}
          </section>

          <section className="feed-personalization-section">
            <ToggleRow
              label="Boost mutual follows"
              hint="Extra boost when both viewer and author follow each other."
              checked={config.boostMutuals?.enabled ?? false}
              onChange={(on) => update({ boostMutuals: { ...config.boostMutuals!, enabled: on } })}
              ariaLabel="Boost mutual follows"
            />
            {config.boostMutuals?.enabled && (
              <label className="feed-personalization-field">
                Factor
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={config.boostMutuals.factor}
                  onChange={(e) => update({ boostMutuals: { enabled: true, factor: parseFloat(e.target.value) || 1.5 } })}
                />
                <span className="card-hint">Stacks with followed boost</span>
              </label>
            )}
          </section>

          <section className="feed-personalization-section">
            <ToggleRow
              label="Suppress served posts"
              hint="Push down posts recently returned in skeleton responses (offered in feed, not necessarily viewed)."
              checked={suppressServed.enabled ?? false}
              onChange={(on) => {
                const prev = suppressServed
                const penalty = prev.penalty >= 1 ? 0.5 : prev.penalty
                update({ suppressServed: { ...prev, enabled: on, penalty } })
              }}
              ariaLabel="Suppress served posts"
            />
            {suppressServed.enabled && (
              <>
                <label className="feed-personalization-field">
                  Penalty
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="0.99"
                    value={suppressServed.penalty}
                    onChange={(e) => update({ suppressServed: { enabled: true, penalty: Math.min(parseFloat(e.target.value) || 0.5, 0.99), windowHours: suppressServed.windowHours } })}
                  />
                  <span className="card-hint">Score multiplier for served posts (0.5 = half score). Must be below 1.</span>
                </label>
                <label className="feed-personalization-field">
                  Window (hours)
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={suppressServed.windowHours}
                    onChange={(e) => update({ suppressServed: { enabled: true, penalty: suppressServed.penalty, windowHours: parseInt(e.target.value) || 48 } })}
                  />
                  <span className="card-hint">How long to remember served posts (not permanent)</span>
                </label>
              </>
            )}
          </section>

          <section className="feed-personalization-section">
            <ToggleRow
              label="Author diversity"
              hint="Prevent too many consecutive posts from the same author."
              checked={config.authorDiversity?.enabled ?? false}
              onChange={(on) => update({ authorDiversity: { ...config.authorDiversity!, enabled: on } })}
              ariaLabel="Author diversity"
            />
            {config.authorDiversity?.enabled && (
              <label className="feed-personalization-field">
                Max consecutive
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="10"
                  value={config.authorDiversity.maxConsecutive}
                  onChange={(e) => update({ authorDiversity: { enabled: true, maxConsecutive: parseInt(e.target.value) || 2 } })}
                />
                <span className="card-hint">How many posts from same author before forcing variety</span>
              </label>
            )}
          </section>

          <section className="feed-personalization-section">
            <ToggleRow
              label="Affinity boost"
              hint="Boost posts from authors the viewer frequently interacts with."
              checked={config.affinityBoost?.enabled ?? false}
              onChange={(on) => update({ affinityBoost: { ...config.affinityBoost!, enabled: on } })}
              ariaLabel="Affinity boost"
            />
            {config.affinityBoost?.enabled && (
              <>
                <label className="feed-personalization-field">
                  Factor
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={config.affinityBoost.factor}
                    onChange={(e) => update({ affinityBoost: { enabled: true, factor: parseFloat(e.target.value) || 1.2, windowDays: config.affinityBoost!.windowDays } })}
                  />
                  <span className="card-hint">Max boost for high-affinity authors</span>
                </label>
                <label className="feed-personalization-field">
                  Window (days)
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={config.affinityBoost.windowDays}
                    onChange={(e) => update({ affinityBoost: { enabled: true, factor: config.affinityBoost!.factor, windowDays: parseInt(e.target.value) || 30 } })}
                  />
                  <span className="card-hint">How far back to look at interactions</span>
                </label>
              </>
            )}
          </section>
        </div>
      )}

      {mode === 'formula' && (
        <div className="feed-personalization-formula">
          <div className="feed-personalization-formula-head">
            <p className="card-hint">
              Write a formula that scores each post for this viewer. Higher scores appear first.
              Use <code>base_score</code> for the sort key from the Sorting tab.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowFieldRef(!showFieldRef)}
            >
              {showFieldRef ? 'Hide field reference' : '📖 Viewer fields'}
            </button>
          </div>
          {showFieldRef && (
            <div className="feed-personalization-field-legend">
              <dl className="formula-field-legend">
                <dt>base_score</dt><dd>Sort key from Sorting tab (the starting score)</dd>
                <dt>is_followed</dt><dd>1 if viewer follows post author, 0 if not</dd>
                <dt>is_follower</dt><dd>1 if post author follows the viewer, 0 if not</dd>
                <dt>is_mutual</dt><dd>1 if mutual follow (both follow each other), 0 if not</dd>
                <dt>times_served</dt><dd>Times this post was returned in getFeedSkeleton</dd>
                <dt>hours_since_served</dt><dd>Hours since last skeleton serve (0 if never)</dd>
                <dt>was_viewed</dt><dd>1 if client reported interactionSeen, else 0 (requires acceptsInteractions on Bluesky publish)</dd>
                <dt>times_viewed</dt><dd>1 if viewed (0/1 until repeat views are tracked)</dd>
                <dt>hours_since_viewed</dt><dd>Hours since client-reported view (0 if never)</dd>
                <dt>hours_since_last_open</dt><dd>Hours since viewer last opened this feed</dd>
                <dt>days_since_interaction</dt><dd>Days since last interaction with this author</dd>
                <dt>feed_affinity</dt><dd>Total interactions with author via this feed</dd>
                <dt>feed_affinity_likes</dt><dd>Likes on author's posts via this feed</dd>
                <dt>feed_affinity_reposts</dt><dd>Reposts of author via this feed</dd>
                <dt>feed_affinity_replies</dt><dd>Replies to author via this feed</dd>
                <dt>feed_affinity_quotes</dt><dd>Quotes of author via this feed</dd>
              </dl>
            </div>
          )}
          <SortFormulaBuilder
            draft={draft}
            onChange={handleFormulaChange}
            initialExpr={config.formula ?? null}
            fields={PERSONALIZATION_FIELDS}
            fieldGroups={PERSONALIZATION_FIELD_GROUPS}
            templates={PERSONALIZATION_TEMPLATES}
            placeholder="base_score * if(is_followed > 0, 1.3, 1) + affinity * 10"
          />
        </div>
      )}
    </div>
  )
}
