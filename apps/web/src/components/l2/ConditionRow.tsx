import type { ReactNode } from 'react'
import type {
  AuthorListConfig,
  FeedAuthorListConfig,
  L2BoolField,
  L2CompareCondition,
  L2MediaTypeValue,
  L2NumericField,
  L2PostKindCondition,
  L2RuleNode,
  L2AuthorCondition,
  PostKind,
} from '@cfb/core-types'
import {
  L2_BOOL_FIELDS,
  L2_COMPARE_OPS,
  L2_MEDIA_STAT_METRICS,
  L2_MEDIA_TYPE_VALUES,
  L2_NUMERIC_FIELDS,
  L2_POST_KINDS,
  fieldLabel,
  formatTags,
  mediaStatLabel,
  mediaTypeLabel,
  parseTags,
} from '../../lib/l2-form'
import { KeywordMatchToggles } from '../KeywordMatchToggles'
import { TermListEditor } from '../TermListEditor'
import { ToggleRow } from '../ToggleRow'
import { LabelsConditionEditor } from './LabelsConditionEditor'
import { LanguagePicker } from './LanguagePicker'
import { AuthorListConditionEditor } from './AuthorListConditionEditor'
import { FollowRingCacheHint } from './FollowRingCacheHint'
import { MentionAccountChips } from './MentionAccountChips'
import { RegexPatternEditor } from './RegexPatternEditor'
import { SearchFieldPicker } from './SearchFieldPicker'
import { UrlSourcePicker } from './UrlSourcePicker'
import { useTermListScrollHeight } from './useTermListScrollHeight'
import type { ListCacheEntry } from '../../api/client'

interface Props {
  node: L2RuleNode
  onChange: (node: L2RuleNode) => void
  onRemove: () => void
  /** Hide row-level remove — inspector supplies its own header delete. */
  showRemove?: boolean
  /** Let keyword term list grow to fill the inspector panel. */
  fillHeight?: boolean
  projectAuthorLists?: AuthorListConfig[]
  feedAuthorLists?: FeedAuthorListConfig[]
  onFeedAuthorListsChange?: (lists: FeedAuthorListConfig[]) => void
  /** Atomically update feed authorLists + this author condition (avoids stale draft overwrites). */
  onAuthorFeedUpdate?: (lists: FeedAuthorListConfig[], node: L2AuthorCondition) => void
  listCache?: ListCacheEntry[]
  projectId?: string
  onRefreshList?: (listId: string) => Promise<void>
  /** Project prefilter editor — no per-node pool toggle. */
  prefilterMode?: boolean
  readOnly?: boolean
}

export function ConditionRow({
  node,
  onChange,
  onRemove,
  showRemove = true,
  fillHeight = false,
  projectAuthorLists = [],
  feedAuthorLists = [],
  onFeedAuthorListsChange,
  onAuthorFeedUpdate,
  listCache = [],
  projectId = '',
  onRefreshList,
  prefilterMode = false,
  readOnly = false,
}: Props) {
  const termScroll = useTermListScrollHeight(
    fillHeight && node.type === 'keyword',
    node.type === 'keyword'
      ? `${(node.terms ?? []).length}:${(node.fields ?? []).length}:${node.wholeWord}:${node.caseSensitive}`
      : '',
  )

  return (
    <div
      className={`l2-condition${fillHeight ? ' l2-condition-fill' : ''}${readOnly ? ' l2-condition--readonly' : ''}`}
    >
      <div className="l2-condition-body">
        {node.type === 'text' && (
          <div className="l2-condition-stack">
            <ConditionHead
              title="Text (legacy)"
              onRemove={onRemove}
              showRemove={showRemove}
            />
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
            >
              <option value="contains">contains</option>
              <option value="not_contains">not contains</option>
              <option value="equals">equals</option>
              <option value="regex">regex</option>
            </select>
            <input
              value={node.value}
              onChange={(e) => onChange({ ...node, value: e.target.value })}
              placeholder="term"
            />
          </div>
        )}

        {node.type === 'keyword' && (
          <div
            ref={termScroll.panelRef}
            className="l2-condition-stack l2-condition-keyword"
          >
            <ConditionHead
              title="Keyword"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <div className="l2-condition-keyword-controls">
              <KeywordMatchToggles
                caseSensitive={node.caseSensitive}
                wholeWord={node.wholeWord}
                onChange={({ caseSensitive, wholeWord }) =>
                  onChange({ ...node, caseSensitive, wholeWord })
                }
                readOnly={readOnly}
              />
              <SearchFieldPicker
                fields={node.fields}
                onChange={(fields) => onChange({ ...node, fields })}
                readOnly={readOnly}
              />
            </div>
            <div ref={termScroll.scrollRef} className="term-list-scroll term-list-scroll--fill scrollbar-modern">
              <TermListEditor
                terms={node.terms}
                onChange={(terms) => onChange({ ...node, terms })}
                placeholder="fema"
                searchable
                caseSensitive={node.caseSensitive === true}
                readOnly={readOnly}
              />
            </div>
          </div>
        )}

        {node.type === 'regex' && (
          <div className="l2-condition-stack l2-condition-regex">
            <ConditionHead
              title="Regex"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="matches">matches</option>
                  <option value="not_matches">not matches</option>
                </select>
              }
            />
            <div className="option-toggle-list">
              <ToggleRow
                label="Case insensitive"
                checked={node.caseInsensitive !== false}
                onChange={(checked) => onChange({ ...node, caseInsensitive: checked })}
                ariaLabel="Case insensitive regex matching"
                readOnly={readOnly}
              />
            </div>
            <SearchFieldPicker
              fields={node.fields}
              onChange={(fields) => onChange({ ...node, fields })}
              readOnly={readOnly}
            />
            <RegexPatternEditor
              pattern={node.pattern}
              caseInsensitive={node.caseInsensitive !== false}
              onChange={(pattern) => onChange({ ...node, pattern })}
              readOnly={readOnly}
            />
          </div>
        )}

        {node.type === 'hashtag' && (
          <div className="l2-condition-stack l2-condition-hashtag">
            <ConditionHead
              title="Hashtag"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <p className="l2-condition-hint">Matches #hashtag facets only — not plain text in the body.</p>
            <div className="term-list-scroll scrollbar-modern l2-hashtag-terms-scroll">
              <TermListEditor
                terms={node.tags}
                onChange={(tags) => onChange({ ...node, tags })}
                placeholder="fema"
                searchable
                stripHash
                itemNoun="hashtag"
                readOnly={readOnly}
              />
            </div>
          </div>
        )}

        {node.type === 'url' && (
          <div className="l2-condition-stack l2-condition-url">
            <ConditionHead
              title="URL"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <p className="l2-condition-hint">
              Substring match on URLs only — link card, body facets, or bridged source. Not post text.
            </p>
            <KeywordMatchToggles
              caseSensitive={node.caseSensitive}
              wholeWord={false}
              onChange={({ caseSensitive }) => onChange({ ...node, caseSensitive })}
              readOnly={readOnly}
            />
            <UrlSourcePicker
              sources={node.sources}
              onChange={(sources) => onChange({ ...node, sources })}
            />
            <div className="term-list-scroll scrollbar-modern">
              <TermListEditor
                terms={node.patterns}
                onChange={(patterns) => onChange({ ...node, patterns })}
                placeholder="nytimes.com"
                searchable
                caseSensitive={node.caseSensitive === true}
                itemNoun="URL pattern"
                readOnly={readOnly}
              />
            </div>
          </div>
        )}

        {node.type === 'bool' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Embed" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.field}
              onChange={(e) => onChange({ ...node, field: e.target.value as L2BoolField })}
            >
              {L2_BOOL_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {fieldLabel(f)}
                </option>
              ))}
            </select>
            <select
              disabled={readOnly}
              value={node.value ? 'require' : 'exclude'}
              onChange={(e) => onChange({ ...node, value: e.target.value === 'require' })}
            >
              <option value="require">required</option>
              <option value="exclude">excluded</option>
            </select>
          </div>
        )}

        {node.type === 'language' && (
          <div className="l2-condition-stack l2-condition-language">
            <ConditionHead
              title="Language"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.unknown}
                  onChange={(e) =>
                    onChange({ ...node, unknown: e.target.value as 'include' | 'exclude' })
                  }
                  title="When the post has no language tag"
                >
                  <option value="exclude">no tag → fail</option>
                  <option value="include">no tag → pass</option>
                </select>
              }
            />
            <LanguagePicker allow={node.allow} onChange={(allow) => onChange({ ...node, allow })} />
          </div>
        )}

        {node.type === 'post_kind' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Post type" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as L2PostKindCondition['op'] })}
            >
              <option value="is">is</option>
              <option value="is_not">is not</option>
            </select>
            <PostKindPicker node={node} onChange={onChange} readOnly={readOnly} />
          </div>
        )}

        {node.type === 'media_type' && (
          <div className="l2-condition-stack">
            <ConditionHead
              title="Media type"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="is">is</option>
                  <option value="is_not">is not</option>
                </select>
              }
            />
            <p className="l2-condition-hint">
              Near You media bucket from ingest (text, image, video, GIF, link card, quote).
            </p>
            <MediaTypePicker node={node} onChange={onChange} readOnly={readOnly} />
          </div>
        )}

        {node.type === 'alt_text' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Alt text" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
            >
              <option value="has">has alt text</option>
              <option value="missing">missing alt text</option>
            </select>
            <p className="l2-condition-hint">Applies to image, video, and GIF posts only.</p>
          </div>
        )}

        {node.type === 'post_age' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Post age" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
            >
              <option value="newer_than">within last</option>
              <option value="older_than">older than</option>
            </select>
            <input
              type="number"
              min={0}
              value={node.hours}
              onChange={(e) => onChange({ ...node, hours: Number(e.target.value) })}
            />
            <span>hours</span>
            <select
              disabled={readOnly}
              value={node.use}
              onChange={(e) => onChange({ ...node, use: e.target.value as typeof node.use })}
            >
              <option value="indexed_at">since indexed</option>
              <option value="created_at">since created</option>
            </select>
          </div>
        )}

        {node.type === 'media_stats' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Media stats" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.metric}
              onChange={(e) =>
                onChange({ ...node, metric: e.target.value as typeof node.metric })
              }
            >
              {L2_MEDIA_STAT_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {mediaStatLabel(metric)}
                </option>
              ))}
            </select>
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
            >
              {L2_COMPARE_OPS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={node.value}
              onChange={(e) => onChange({ ...node, value: Number(e.target.value) })}
            />
            {node.metric.includes('size_bytes') ? (
              <p className="l2-condition-hint">
                Size values are in bytes (4 MB = 4194304). Bluesky reports blob size on each embed.
              </p>
            ) : node.metric.includes('aspect') ? (
              <p className="l2-condition-hint">
                Aspect width/height are ratio components from the record, not pixel resolution.
              </p>
            ) : null}
          </div>
        )}

        {node.type === 'mime_type' && (
          <div className="l2-condition-stack">
            <ConditionHead
              title="MIME type"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <input
              value={node.pattern}
              onChange={(e) => onChange({ ...node, pattern: e.target.value })}
              placeholder="image/jpeg or video/"
            />
            <p className="l2-condition-hint">
              Matches any embed blob mime (images, video, link card thumb).
            </p>
          </div>
        )}

        {node.type === 'labels' && (
          <div className="l2-condition-stack l2-condition-labels">
            <ConditionHead
              title="Labels"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as 'includes' | 'excludes' })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <select
              disabled={readOnly}
              value={node.scope}
              onChange={(e) =>
                onChange({
                  ...node,
                  scope: e.target.value as 'all' | 'self' | 'labeler',
                  labelerDids: e.target.value !== 'labeler' ? undefined : node.labelerDids,
                })
              }
              title="Self-labels on record vs labeler-applied moderation"
            >
              <option value="all">self + labeler</option>
              <option value="self">self only</option>
              <option value="labeler">labeler only</option>
            </select>
            <LabelsConditionEditor
              node={node}
              onChange={(next) => onChange(next)}
              readOnly={readOnly}
            />
          </div>
        )}

        {node.type === 'compare' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Math" onRemove={onRemove} showRemove={showRemove} />
            <MathCompareRow node={node} onChange={onChange} readOnly={readOnly} />
          </div>
        )}

        {node.type === 'author' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Author" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={readOnly}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
            >
              <option value="in_list">in list</option>
              <option value="not_in_list">not in list</option>
            </select>
            {onAuthorFeedUpdate || onFeedAuthorListsChange ? (
              <AuthorListConditionEditor
                node={node}
                onChange={(next) => onChange(next)}
                projectAuthorLists={projectAuthorLists}
                feedAuthorLists={feedAuthorLists}
                onFeedAuthorListsChange={onFeedAuthorListsChange ?? (() => undefined)}
                onAuthorFeedUpdate={onAuthorFeedUpdate}
                listCache={listCache}
                projectId={projectId}
                onRefreshList={onRefreshList}
                prefilterMode={prefilterMode}
              />
            ) : (
              <>
                <input
                  value={node.listId ?? ''}
                  onChange={(e) => onChange({ ...node, listId: e.target.value || undefined })}
                  placeholder="List name"
                />
                <input
                  value={(node.dids ?? []).join(', ')}
                  onChange={(e) =>
                    onChange({
                      ...node,
                      dids: e.target.value
                        .split(/[,\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="did:plc:… (optional)"
                />
              </>
            )}
          </div>
        )}

        {node.type === 'mention' && (
          <div className="l2-condition-stack l2-condition-mention">
            <ConditionHead
              title="Mention"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <p className="l2-condition-hint">
              Matches @mention facets — not the post author, not plain @text without a facet.
            </p>
            <div className="term-list-scroll scrollbar-modern l2-mention-terms-scroll">
              <TermListEditor
                terms={node.accounts}
                onChange={(accounts) => onChange({ ...node, accounts })}
                placeholder="user.bsky.social"
                searchable
                stripAt
                itemNoun="account"
                readOnly={readOnly}
              />
            </div>
            <MentionAccountChips accounts={node.accounts} />
            <ToggleRow
              label="Also match Bluesky list"
              checked={node.listUri !== undefined}
              onChange={(checked) =>
                onChange({ ...node, listUri: checked ? '' : undefined })
              }
              ariaLabel="Also match members of a Bluesky list"
              hint="List must already be synced on this deployment (L1 author list or feed list poll)."
              readOnly={readOnly}
            />
            {node.listUri !== undefined ? (
              <input
                readOnly={readOnly}
                disabled={readOnly}
                value={node.listUri}
                onChange={(e) => onChange({ ...node, listUri: e.target.value })}
                placeholder="at://did:plc:…/app.bsky.graph.list/… or bsky.app list URL"
                className="mono"
              />
            ) : null}
          </div>
        )}

        {node.type === 'follow_ring' && (
          <div className="l2-condition-stack l2-condition-follow-ring">
            <ConditionHead
              title="Follow ring"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={readOnly}
                  value={node.op}
                  onChange={(e) => onChange({ ...node, op: e.target.value as typeof node.op })}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <p className="l2-condition-hint">
              Match post authors in a hub&apos;s follows or followers — e.g. community opt-in by
              following the hub. Account hub filters at ingest; viewer hub personalizes at serve time.
            </p>
            <label>
              Hub source
              <select
                disabled={readOnly}
                value={node.hubSource ?? 'account'}
                onChange={(e) =>
                  onChange({
                    ...node,
                    hubSource: e.target.value as 'account' | 'viewer',
                  })
                }
              >
                <option value="account">Fixed account (cached at ingest)</option>
                <option value="viewer">Whoever is viewing (skeleton serve)</option>
              </select>
            </label>
            {(node.hubSource ?? 'account') === 'account' && (
              <label>
                Hub account
                <input
                  value={node.hub ?? ''}
                  onChange={(e) => onChange({ ...node, hub: e.target.value })}
                  placeholder="community.bsky.social or did:plc:…"
                />
              </label>
            )}
            <label>
              Ring direction
              <select
                disabled={readOnly}
                value={node.direction}
                onChange={(e) =>
                  onChange({
                    ...node,
                    direction: e.target.value as typeof node.direction,
                  })
                }
              >
                <option value="followers">People who follow the hub</option>
                <option value="both">Follows and followers (union)</option>
                <option value="follows">People the hub follows</option>
              </select>
            </label>
            {(node.hubSource ?? 'account') === 'account' && (
              <label>
                Refresh interval (minutes)
                <input
                  type="number"
                  min={15}
                  max={1440}
                  value={node.pollIntervalMinutes ?? 60}
                  onChange={(e) =>
                    onChange({ ...node, pollIntervalMinutes: Number(e.target.value) || 60 })
                  }
                />
              </label>
            )}
            {(node.hubSource ?? 'account') === 'account' ? (
              <FollowRingCacheHint node={node} listCache={listCache} />
            ) : (
              <p className="l2-condition-hint">
                Resolved from the signed-in viewer&apos;s Bluesky graph when the feed is served.
                Anonymous viewers skip this filter.
              </p>
            )}
          </div>
        )}

        {node.type === 'graze_stub' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Graze" onRemove={onRemove} showRemove={showRemove} />
            <span className="l2-graze-stub-label" title="Imported Graze node — replace with a native condition when ready">
              {node.title ?? node.grazeType}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ConditionHead({
  title,
  onRemove,
  showRemove = true,
  trailing,
}: {
  title: string
  onRemove: () => void
  showRemove?: boolean
  trailing?: ReactNode
}) {
  return (
    <div className="l2-condition-head">
      <div className="l2-condition-head-left">
        <span className="l2-condition-type">{title}</span>
        {showRemove ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm l2-condition-remove"
            onClick={onRemove}
            aria-label={`Remove ${title} condition`}
          >
            ×
          </button>
        ) : null}
      </div>
      {trailing}
    </div>
  )
}

function PostKindPicker({
  node,
  onChange,
  readOnly = false,
}: {
  node: Extract<L2RuleNode, { type: 'post_kind' }>
  onChange: (node: L2RuleNode) => void
  readOnly?: boolean
}) {
  const toggle = (kind: PostKind) => {
    const set = new Set(node.kinds)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    onChange({ ...node, kinds: L2_POST_KINDS.filter((k) => set.has(k)) })
  }

  return (
    <div className="option-toggle-list l2-post-kind-toggle-list">
      {L2_POST_KINDS.map((kind) => (
        <ToggleRow
          key={kind}
          label={fieldLabel(kind)}
          checked={node.kinds.includes(kind)}
          onChange={() => toggle(kind)}
          ariaLabel={`Post kind ${fieldLabel(kind)}`}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}

function MediaTypePicker({
  node,
  onChange,
  readOnly = false,
}: {
  node: Extract<L2RuleNode, { type: 'media_type' }>
  onChange: (node: L2RuleNode) => void
  readOnly?: boolean
}) {
  const toggle = (value: L2MediaTypeValue) => {
    const set = new Set(node.mediaTypes)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    onChange({ ...node, mediaTypes: L2_MEDIA_TYPE_VALUES.filter((v) => set.has(v)) })
  }

  return (
    <div className="option-toggle-list l2-post-kind-toggle-list">
      {L2_MEDIA_TYPE_VALUES.map((value) => (
        <ToggleRow
          key={value}
          label={mediaTypeLabel(value)}
          checked={node.mediaTypes.includes(value)}
          onChange={() => toggle(value)}
          ariaLabel={`Media type ${mediaTypeLabel(value)}`}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}

function MathCompareRow({
  node,
  onChange,
  readOnly = false,
}: {
  node: L2CompareCondition
  onChange: (node: L2RuleNode) => void
  readOnly?: boolean
}) {
  const leftField =
    node.left.type === 'field'
      ? node.left.field
      : node.left.type === 'binary' && node.left.left.type === 'field'
        ? node.left.left.field
        : 'like_count'
  const plusField =
    node.left.type === 'binary' && node.left.right.type === 'field'
      ? node.left.right.field
      : 'repost_count'
  const literal = node.right.type === 'literal' ? node.right.value : 10

  const apply = (a: L2NumericField, b: L2NumericField, op: L2CompareCondition['op'], lit: number) => {
    onChange({
      ...node,
      left: {
        type: 'binary',
        op: '+',
        left: { type: 'field', field: a },
        right: { type: 'field', field: b },
      },
      op,
      right: { type: 'literal', value: lit },
    })
  }

  return (
    <>
      <select disabled={readOnly} value={leftField} onChange={(e) => apply(e.target.value as L2NumericField, plusField, node.op, literal)}>
        {L2_NUMERIC_FIELDS.map((f) => (
          <option key={f} value={f}>
            {fieldLabel(f)}
          </option>
        ))}
      </select>
      <span>+</span>
      <select disabled={readOnly} value={plusField} onChange={(e) => apply(leftField, e.target.value as L2NumericField, node.op, literal)}>
        {L2_NUMERIC_FIELDS.filter((f) => f !== leftField).map((f) => (
          <option key={f} value={f}>
            {fieldLabel(f)}
          </option>
        ))}
      </select>
      <select
        disabled={readOnly}
        value={node.op}
        onChange={(e) => apply(leftField, plusField, e.target.value as L2CompareCondition['op'], literal)}
      >
        {L2_COMPARE_OPS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <input
        type="number"
        readOnly={readOnly}
        disabled={readOnly}
        value={literal}
        onChange={(e) => apply(leftField, plusField, node.op, Number(e.target.value))}
      />
    </>
  )
}
