import { useState } from 'react'
import type { FeedConfig, L2Expr, NativePersonalizationConfig } from '@cfb/core-types'
import { DEFAULT_PERSONALIZATION, resolveSuppressServed } from '@cfb/core-types'
import { clearPersonalizationFormulaPackRef } from '../../lib/feed-personalization'
import { PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { ToggleRow } from '../ToggleRow'
import { SortFormulaBuilder } from './SortFormulaBuilder'
import { FeedPersonalizationOrchestrationSection } from './FeedPersonalizationOrchestrationSection'
import { FeedModePicker } from './FeedModePicker'
import { PERSONALIZATION_FORMULA_FIELD_LEGEND } from './formula-field-legend-data'
import { PERSONALIZATION_MODE_OPTIONS, type PersonalizationModeId } from '../../lib/feed-personalization-modes'
import {
  PERSONALIZATION_FIELD_GROUPS,
  PERSONALIZATION_SNIPPETS,
  PERSONALIZATION_TEMPLATES,
} from './feed-personalization-presets'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

type PersonalizationMode = PersonalizationModeId

export function FeedPersonalizationPanel({ draft, onChange }: Props) {
  const config = draft.personalization ?? DEFAULT_PERSONALIZATION
  const suppressServed = resolveSuppressServed(config) ?? DEFAULT_PERSONALIZATION.suppressServed!
  const [mode, setMode] = useState<PersonalizationMode>(
    config.formulaEnabled ? 'formula' : 'presets',
  )

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
      <FeedModePicker
        options={[...PERSONALIZATION_MODE_OPTIONS]}
        value={mode}
        onChange={(id) => handleModeChange(id as PersonalizationMode)}
        ariaLabel="Personalization mode"
        className="feed-personalization-modes"
      />

      <hr className="feed-sort-section-divider feed-personalization-mode-divider" />

      {mode === 'presets' && (
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
          <SortFormulaBuilder
            draft={draft}
            onChange={handleFormulaChange}
            initialExpr={config.formula ?? null}
            fields={PERSONALIZATION_FIELDS}
            fieldGroups={PERSONALIZATION_FIELD_GROUPS}
            templates={PERSONALIZATION_TEMPLATES}
            snippets={PERSONALIZATION_SNIPPETS}
            fieldLegend={PERSONALIZATION_FORMULA_FIELD_LEGEND}
            fieldLegendToggleLabel="Viewer fields"
            fieldLegendHint="Write a formula that scores each post for this viewer. Higher scores appear first. Use base_score for the sort key from the Sorting tab."
            placeholder="base_score * if(is_followed > 0, 1.3, 1) + affinity * 10"
          />
        </div>
      )}

      <FeedPersonalizationOrchestrationSection draft={draft} onChange={onChange} />
    </div>
  )
}
