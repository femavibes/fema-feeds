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
    <div className="feed-personalization-orchestration">
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
          How many top-sorted candidates personalization can reorder on each open. Higher depth reaches
          never-served posts deeper in the pool; lower depth is faster.
        </p>
      </section>

      <section className="feed-personalization-section feed-personalization-serve-section">
        <label className="feed-personalization-field feed-personalization-field--inline">
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
        </label>
        <p className="card-hint feed-personalization-serve-hint">
          Max consecutive posts from the same author after scoring. Set to 0 to disable.
          Applied as a layout pass — not part of the scoring formula.
        </p>
      </section>
    </div>
  )
}
