import type { FeedConfig, NativePersonalizationConfig } from '@cfb/core-types'
import { DEFAULT_PERSONALIZATION } from '@cfb/core-types'
import { ToggleRow } from '../ToggleRow'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

export function FeedPersonalizationPanel({ draft, onChange }: Props) {
  const config = draft.personalization ?? DEFAULT_PERSONALIZATION

  const update = (patch: Partial<NativePersonalizationConfig>) => {
    onChange({ ...draft, personalization: { ...config, ...patch } })
  }

  return (
    <div className="feed-personalization-panel">
      <p className="card-hint">
        Viewer-aware adjustments applied at serve time. Each viewer gets a personalized page order
        based on their follow graph, interaction history, and what they've already seen.
      </p>

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
  )
}
