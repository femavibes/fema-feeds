import { useState } from 'react'
import type { FeedConfig, L2Expr, NativePersonalizationConfig } from '@cfb/core-types'
import { DEFAULT_PERSONALIZATION } from '@cfb/core-types'
import { PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { ToggleRow } from '../ToggleRow'
import { SortFormulaBuilder, type FormulaTemplate, type FormulaFieldGroup } from './SortFormulaBuilder'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

type PersonalizationMode = 'toggles' | 'formula'

const PERSONALIZATION_TEMPLATES: FormulaTemplate[] = [
  { name: 'Follow boost', formula: 'base_score * if(is_followed > 0, 1.3, 1)' },
  { name: 'Mutual priority', formula: 'base_score * if(is_mutual > 0, 1.5, if(is_followed > 0, 1.2, 1))' },
  { name: 'Suppress seen', formula: 'base_score - times_seen * 50' },
  { name: 'Affinity blend', formula: 'base_score + feed_affinity * 10' },
  { name: 'Full personalization', formula: 'base_score * if(is_followed > 0, 1.3, 1) + feed_affinity * 10 - times_seen * 30' },
  { name: 'Freshness recovery', formula: 'base_score + if(hours_since_last_open > 24, 100, 0)' },
  { name: 'Social proximity', formula: 'base_score * (1 + is_followed * 0.3 + is_mutual * 0.5) + feed_affinity * 5' },
  { name: 'Seen decay', formula: 'base_score / (times_seen + 1)' },
  { name: 'Engagement + social', formula: 'base_score + likes * if(is_followed > 0, 2, 1) + feed_affinity * 8' },
  { name: 'Interaction recency', formula: 'base_score * if(days_since_interaction < 7, 1.4, if(days_since_interaction < 30, 1.1, 1))' },
]

const PERSONALIZATION_FIELD_GROUPS: FormulaFieldGroup[] = [
  {
    label: 'Viewer signals',
    fields: ['base_score', 'is_followed', 'is_mutual', 'times_seen', 'hours_since_seen', 'hours_since_last_open', 'days_since_interaction'],
  },
  {
    label: 'Feed affinity (interactions via this feed)',
    fields: ['feed_affinity', 'feed_affinity_likes', 'feed_affinity_reposts', 'feed_affinity_replies', 'feed_affinity_quotes'],
  },
  {
    label: 'Post metrics',
    fields: ['likes', 'reposts', 'replies', 'quotes', 'bookmarks', 'followers', 'follows', 'posts'],
  },
  {
    label: 'Content',
    fields: ['text_len', 'images', 'video_size', 'hashtags', 'links', 'mentions', 'editor_score', 'age_hours'],
  },
]

export function FeedPersonalizationPanel({ draft, onChange }: Props) {
  const config = draft.personalization ?? DEFAULT_PERSONALIZATION
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
    update({ formula: expr, formulaEnabled: true })
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
          label="Formula"
          hint="Write a math formula using viewer signals (base_score, is_followed, affinity, etc.)."
          checked={mode === 'formula'}
          onChange={(on) => { if (on) handleModeChange('formula') }}
          ariaLabel="Formula-based personalization"
        />
      </div>

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
              label="Suppress seen posts"
              hint="Push down posts the viewer has already been served."
              checked={config.suppressSeen?.enabled ?? false}
              onChange={(on) => update({ suppressSeen: { ...config.suppressSeen!, enabled: on } })}
              ariaLabel="Suppress seen posts"
            />
            {config.suppressSeen?.enabled && (
              <>
                <label className="feed-personalization-field">
                  Penalty
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={config.suppressSeen.penalty}
                    onChange={(e) => update({ suppressSeen: { enabled: true, penalty: parseFloat(e.target.value) || 0.5, windowHours: config.suppressSeen!.windowHours } })}
                  />
                  <span className="card-hint">0.5 = half score, 0.1 = nearly hidden</span>
                </label>
                <label className="feed-personalization-field">
                  Window (hours)
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={config.suppressSeen.windowHours}
                    onChange={(e) => update({ suppressSeen: { enabled: true, penalty: config.suppressSeen!.penalty, windowHours: parseInt(e.target.value) || 48 } })}
                  />
                  <span className="card-hint">How long to remember seen posts</span>
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
                <dt>is_mutual</dt><dd>1 if mutual follow, 0 if not</dd>
                <dt>times_seen</dt><dd>Times this post was served to this viewer</dd>
                <dt>hours_since_seen</dt><dd>Hours since last served (0 if never)</dd>
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
