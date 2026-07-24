import type { AuthorFairnessMode, DecayMode, SortTuning } from '@cfb/core-types'

const AUTHOR_FAIRNESS_OPTIONS: { value: AuthorFairnessMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'No equalization' },
  { value: 'log', label: 'Log (gentle)', hint: 'Slight boost to small accounts' },
  { value: 'sqrt', label: 'Sqrt (moderate)', hint: 'Strong equalization' },
  { value: 'sigmoid', label: 'Sigmoid (aggressive)', hint: 'Heavy anti-megaphone' },
]

interface Props {
  tuning: SortTuning
  onChange: (next: SortTuning) => void
  disabled?: boolean
}

export function FeedSortSharedSection({ tuning, onChange, disabled }: Props) {
  return (
    <section className="feed-sort-shared-section">
      <hr className="feed-sort-section-divider" />
      <p className="sidebar-block-title">Shared scoring</p>
      <fieldset className="feed-sorting-tuning-fields feed-sort-shared-fields" disabled={disabled}>
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
            <span className="card-hint">Gentle. Score halves every N hours.</span>
          )}
          {tuning.decayMode === 'exponential' && (
            <span className="card-hint">Aggressive. Score compounds down every N hours.</span>
          )}
          {tuning.decayMode === 'rate' && (
            <span className="card-hint">Divides by post_age_hours + 1 — rewards fast engagement.</span>
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
          <span className="card-hint">0 = off. Adds editor_score from Score nodes.</span>
        </label>
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
          <span className="card-hint">Equalizes reach across follower counts.</span>
        </label>
      </fieldset>
    </section>
  )
}
