import type {
  ScoutFeedSource,
  SubstituteFeedSource,
  SubstitutePathwayConfig,
  SubstitutionDirection,
} from '@cfb/core-types'
import { TermListEditor } from '../TermListEditor'

const SUBSTITUTION_DIRECTIONS: { value: SubstitutionDirection; label: string }[] = [
  { value: 'reply_to_root', label: 'Reply → Root post' },
  { value: 'reply_to_parent', label: 'Reply → Parent post' },
  { value: 'quote_to_quoted', label: 'Quote → Quoted post' },
  { value: 'quoted_to_quoters', label: 'Pool post quoted → Pull in quoters' },
  { value: 'replied_to_repliers', label: 'Pool post replied → Pull in repliers' },
]

function substituteThresholdLabel(direction: SubstitutionDirection): string {
  if (direction === 'quoted_to_quoters') return 'Quotes needed'
  if (direction === 'replied_to_repliers') return 'Replies needed'
  if (direction === 'quote_to_quoted') return 'Matching quotes needed'
  return 'Matching replies needed'
}

function substituteHint(pathway: SubstitutePathwayConfig): string {
  const { direction, threshold, timeWindowHours } = pathway
  const window = timeWindowHours ? ` within ${timeWindowHours}h` : ''
  switch (direction) {
    case 'quoted_to_quoters':
      return `When a pool post accumulates ${threshold} quote(s)${window}, those quote posts enter via the SUBSTITUTE path.`
    case 'replied_to_repliers':
      return `When a pool post accumulates ${threshold} repl${threshold === 1 ? 'y' : 'ies'}${window}, those reply posts enter via the SUBSTITUTE path.`
    case 'quote_to_quoted':
      return `When ${threshold} matching quote(s) reference a post${window}, that quoted post enters via the SUBSTITUTE path.`
    default:
      return `When ${threshold} matching repl${threshold === 1 ? 'y' : 'ies'} arrive${window}, the ${direction === 'reply_to_root' ? 'root' : 'parent'} post enters via the SUBSTITUTE path.`
  }
}

interface ScoutEditorProps {
  value: ScoutFeedSource
  onChange: (next: ScoutFeedSource) => void
  readOnly?: boolean
}

export function ScoutSourceEditor({ value, onChange, readOnly }: ScoutEditorProps) {
  return (
    <div className="discovery-source-editor">
      <label className="l2-condition-field">
        Scout source
        <select
          value={value.autoDerive ? 'auto' : 'manual'}
          onChange={(e) => {
            if (e.target.value === 'auto') {
              onChange({ ...value, autoDerive: { source: 'top_pool_authors', count: 10 } })
            } else {
              onChange({ ...value, autoDerive: undefined })
            }
          }}
          disabled={readOnly}
        >
          <option value="manual">Manual (specify accounts)</option>
          <option value="auto">Auto-derive from pool</option>
        </select>
      </label>
      {value.autoDerive ? (
        <>
          <label className="l2-condition-field">
            Derive from
            <select
              value={value.autoDerive.source}
              onChange={(e) =>
                onChange({
                  ...value,
                  autoDerive: {
                    ...value.autoDerive!,
                    source: e.target.value as 'top_pool_authors' | 'top_engagers',
                  },
                })
              }
              disabled={readOnly}
            >
              <option value="top_pool_authors">Top pool authors (most posts)</option>
              <option value="top_engagers">Top engagers (most likes/reposts on pool)</option>
            </select>
          </label>
          <label className="l2-condition-field">
            Number of scouts
            <input
              type="number"
              min={1}
              max={50}
              value={value.autoDerive.count}
              onChange={(e) =>
                onChange({
                  ...value,
                  autoDerive: { ...value.autoDerive!, count: Math.max(1, Number(e.target.value) || 10) },
                })
              }
              disabled={readOnly}
            />
          </label>
          <p className="card-hint">Auto-derived scouts refresh every 6 hours. You can also add manual scouts below.</p>
        </>
      ) : null}
      <label className="l2-condition-field">
        {value.autoDerive ? 'Additional scout accounts (optional)' : 'Scout accounts'}
      </label>
      <div className="term-list-scroll scrollbar-modern l2-scout-accounts-scroll">
        <TermListEditor
          terms={value.scouts ?? []}
          onChange={(scouts) => onChange({ ...value, scouts })}
          placeholder="did:plc:… or handle.bsky.social"
          searchable
          itemNoun="account"
          readOnly={readOnly}
        />
      </div>
      {!readOnly && (value.scouts ?? []).some((s) => !s.startsWith('did:')) ? (
        <p className="card-hint">Handles will be resolved to DIDs when the feed is saved.</p>
      ) : null}
      <label className="l2-condition-field">
        Min scouts (fastest trigger)
        <input
          type="number"
          min={1}
          max={100}
          value={value.threshold.min}
          onChange={(e) =>
            onChange({
              ...value,
              threshold: { ...value.threshold, min: Math.max(1, Number(e.target.value) || 1) },
            })
          }
          disabled={readOnly}
        />
      </label>
      <label className="l2-condition-field">
        Max scouts (always triggers)
        <input
          type="number"
          min={1}
          max={100}
          value={value.threshold.max}
          onChange={(e) =>
            onChange({
              ...value,
              threshold: { ...value.threshold, max: Math.max(1, Number(e.target.value) || 1) },
            })
          }
          disabled={readOnly}
        />
      </label>
      <label className="l2-condition-field">
        Scale window (minutes)
        <input
          type="number"
          min={1}
          value={value.threshold.scaleWindowMinutes}
          onChange={(e) =>
            onChange({
              ...value,
              threshold: {
                ...value.threshold,
                scaleWindowMinutes: Math.max(1, Number(e.target.value) || 60),
              },
            })
          }
          disabled={readOnly}
        />
      </label>
      <label className="l2-condition-field">
        Curve
        <select
          value={value.threshold.curve}
          onChange={(e) =>
            onChange({
              ...value,
              threshold: { ...value.threshold, curve: e.target.value as 'linear' | 'curved' },
            })
          }
          disabled={readOnly}
        >
          <option value="linear">Linear</option>
          <option value="curved">Curved (rewards early bursts)</option>
        </select>
      </label>
      {value.threshold.curve === 'curved' ? (
        <label className="l2-condition-field">
          Exponent
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={value.threshold.exponent ?? 1.5}
            onChange={(e) =>
              onChange({
                ...value,
                threshold: { ...value.threshold, exponent: Number(e.target.value) || 1.5 },
              })
            }
            disabled={readOnly}
          />
        </label>
      ) : null}
      <label className="l2-condition-field">
        Max post age (hours, 0 = unlimited)
        <input
          type="number"
          min={0}
          value={value.maxPostAgeHours ?? 48}
          onChange={(e) =>
            onChange({ ...value, maxPostAgeHours: Math.max(0, Number(e.target.value) || 0) })
          }
          disabled={readOnly}
        />
      </label>
      <p className="card-hint">
        When {value.threshold.min}–{value.threshold.max} distinct scouts interact with the same post
        (scaling over {value.threshold.scaleWindowMinutes} min), that post is fetched and evaluated
        through your SCOUT path on the canvas.
      </p>
    </div>
  )
}

interface SubstituteEditorProps {
  value: SubstituteFeedSource
  onChange: (next: SubstituteFeedSource) => void
  readOnly?: boolean
}

export function SubstituteSourceEditor({ value, onChange, readOnly }: SubstituteEditorProps) {
  const pathways = value.pathways

  const updatePathway = (index: number, next: SubstitutePathwayConfig) => {
    const copy = [...pathways]
    copy[index] = next
    onChange({ ...value, pathways: copy })
  }

  const removePathway = (index: number) => {
    onChange({ ...value, pathways: pathways.filter((_, i) => i !== index) })
  }

  return (
    <div className="discovery-source-editor">
      <p className="card-hint">
        Replies and quotes in the pool vote toward promoted posts. Wire the SUBSTITUTE node on the
        canvas through hashtag, language, or other gates before FEED.
      </p>
      {pathways.map((pathway, i) => (
        <div key={i} className="native-injector-card">
          <div className="injector-card">
            <div className="injector-card-head">
              <span className="injector-card-type">
                {SUBSTITUTION_DIRECTIONS.find((d) => d.value === pathway.direction)?.label ??
                  pathway.direction}
              </span>
              {!readOnly && pathways.length > 1 ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePathway(i)}>
                  ×
                </button>
              ) : null}
            </div>
            <div className="injector-card-body">
              <label className="l2-condition-field">
                Direction
                <select
                  value={pathway.direction}
                  onChange={(e) =>
                    updatePathway(i, {
                      ...pathway,
                      direction: e.target.value as SubstitutionDirection,
                    })
                  }
                  disabled={readOnly}
                >
                  {SUBSTITUTION_DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="l2-condition-field">
                {substituteThresholdLabel(pathway.direction)}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={pathway.threshold}
                  onChange={(e) =>
                    updatePathway(i, {
                      ...pathway,
                      threshold: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  disabled={readOnly}
                />
              </label>
              <label className="l2-condition-field">
                Recency window (hours, 0 = no expiry)
                <input
                  type="number"
                  min={0}
                  value={pathway.timeWindowHours ?? 0}
                  onChange={(e) =>
                    updatePathway(i, {
                      ...pathway,
                      timeWindowHours: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  disabled={readOnly}
                />
              </label>
              <p className="card-hint">{substituteHint(pathway)}</p>
            </div>
          </div>
        </div>
      ))}
      {!readOnly ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            onChange({
              ...value,
              pathways: [
                ...pathways,
                { direction: 'reply_to_root', threshold: 1, timeWindowHours: 0 },
              ],
            })
          }
        >
          + Pathway
        </button>
      ) : null}
    </div>
  )
}
