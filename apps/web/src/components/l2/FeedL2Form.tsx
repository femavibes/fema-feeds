import type { FeedConfig } from '@cfb/core-types'

import { ToggleRow } from '../ToggleRow'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
  compact?: boolean
  sidebar?: boolean
}

export function FeedL2Form({ draft, onChange, compact = false, sidebar = false }: Props) {
  const patch = (partial: Partial<FeedConfig>) => onChange({ ...draft, ...partial })

  return (
    <div
      className={`form-stack${compact ? ' form-stack-compact' : ''}${sidebar ? ' form-stack-sidebar' : ''}`}
    >
      <section className={compact ? 'feed-setup-section' : 'card'}>
        <ToggleRow
          label="Feed active"
          hint="When on, live rules run and this feed can serve posts to subscribers."
          checked={draft.enabled}
          onChange={(enabled) => patch({ enabled })}
          ariaLabel="Feed active"
        />
        <div className="field-grid">
          <label>
            Display name
            <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label>
            Feed ID
            <input value={draft.feedId} readOnly className="readonly" />
          </label>
          <label>
            Pool scope
            <select
              value={draft.poolScope}
              onChange={(e) => patch({ poolScope: e.target.value as FeedConfig['poolScope'] })}
            >
              <option value="project_only">This project pool only</option>
              <option value="global">All ingested posts</option>
            </select>
          </label>
          {!compact && (
            <>
              <label>
                Published URI (optional)
                <input
                  value={draft.publishedUri ?? ''}
                  onChange={(e) => patch({ publishedUri: e.target.value || undefined })}
                  placeholder="at://did:plc:…/app.bsky.feed.generator/…"
                />
              </label>
              <label>
                ATProto rkey (optional)
                <input
                  value={draft.atprotoRkey ?? ''}
                  onChange={(e) => patch({ atprotoRkey: e.target.value || undefined })}
                  placeholder="defaults to feed ID"
                />
              </label>
            </>
          )}
        </div>
        {!compact && (
          <p className="card-hint">
            L2 runs on posts already in the pool (L1). Use the visual editor below to define which
            posts belong in this feed.
          </p>
        )}
      </section>
    </div>
  )
}
