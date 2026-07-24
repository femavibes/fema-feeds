import type { FeedConfig, NativePersonalizationConfig } from '@cfb/core-types'
import { DEFAULT_PERSONALIZATION, PERSONALIZATION_DEPTH_DEFAULT, PERSONALIZATION_DEPTH_MAX } from '@cfb/core-types'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

export function FeedPersonalizationOrchestrationSection({ draft, onChange }: Props) {
  const config = draft.personalization ?? DEFAULT_PERSONALIZATION

  const update = (patch: Partial<NativePersonalizationConfig>) => {
    onChange({ ...draft, personalization: { ...config, ...patch } })
  }

  return (
    <section className="feed-personalization-orchestration feed-sort-shared-section">
      <hr className="feed-sort-section-divider" />
      <p className="sidebar-block-title">Feed layout</p>
      <fieldset className="feed-sorting-tuning-fields feed-sort-shared-fields">
        <div className="feed-sort-shared-dropdown-row">
          <label className="l2-inspector-field">
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
            <span className="card-hint">
              How many top-sorted candidates personalization can reorder on each open. Higher depth
              reaches never-served posts deeper in the pool; lower depth is faster.
            </span>
          </label>
          <label className="l2-inspector-field">
            Author diversity
            <input
              type="number"
              step="1"
              min="0"
              max="10"
              value={config.authorDiversity?.enabled ? config.authorDiversity.maxConsecutive : 0}
              onChange={(e) => {
                const raw = parseInt(e.target.value) || 0
                if (raw <= 0) {
                  update({ authorDiversity: { enabled: false, maxConsecutive: config.authorDiversity?.maxConsecutive ?? 2 } })
                } else {
                  update({ authorDiversity: { enabled: true, maxConsecutive: Math.min(raw, 10) } })
                }
              }}
            />
            <span className="card-hint">
              Max consecutive posts from the same author after scoring. Set to 0 to disable.
              Applied as a layout pass — not part of the scoring formula.
            </span>
          </label>
        </div>
      </fieldset>
    </section>
  )
}
