import type { ReactNode } from 'react'
import type {
  AuthorListConfig,
  FeedAuthorListConfig,
  L2CompareCondition,
  L2MediaKind,
  L2NumericField,
  L2PostKindCondition,
  L2RuleNode,
  L2AuthorCondition,
  PostKind,
} from '@cfb/core-types'
import {
  L2_COMPARE_OPS,
  L2_MEDIA_KINDS,
  L2_MEDIA_STAT_METRICS,
  L2_NUMERIC_FIELDS,
  L2_POST_KINDS,
  fieldLabel,
  formatTags,
  mediaKindLabel,
  mediaStatLabel,
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
import { IngestDiscoverFilterField, withOpAndIngestRole } from './IngestDiscoverFilterField'
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
  feedId?: string
  onRefreshList?: (listId: string) => Promise<void>
  onListsChanged?: () => void | Promise<void>
  /** Project prefilter editor — no per-node pool toggle. */
  prefilterMode?: boolean
  readOnly?: boolean
  /**
   * Embed on the canvas expand panel — same fields as Properties, denser chrome.
   * Hides the redundant type title (node head already shows it).
   */
  canvasEmbed?: boolean
  /**
   * Properties owned by a Parameter control — shown with live (patched) values and
   * locked for editing. Flip the Parameter to change them.
   */
  paramLockedProps?: ReadonlySet<string>
  /** Short explanation of which Parameter owns locked fields. */
  paramLockHint?: string
  /**
   * Live list/string fields after Params apply (baseline stays in the editors above).
   * Shows merge/replace results so the effect is visible.
   */
  paramListPreviews?: Array<{
    property: string
    label: string
    authored: string[]
    effective: string[]
    changed: boolean
  }>
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
  feedId = '',
  onRefreshList,
  onListsChanged,
  prefilterMode = false,
  readOnly = false,
  canvasEmbed = false,
  paramLockedProps,
  paramLockHint,
  paramListPreviews,
}: Props) {
  const termScroll = useTermListScrollHeight(
    fillHeight && node.type === 'keyword',
    node.type === 'keyword'
      ? `${(node.terms ?? []).length}:${(node.fields ?? []).length}:${node.wholeWord}:${node.caseSensitive}`
      : '',
  )

  const locked = (prop: string) => readOnly || Boolean(paramLockedProps?.has(prop))

  const liveListFor = (property: string) =>
    paramListPreviews?.find((p) => p.property === property && p.changed)

  return (
    <div
      className={`l2-condition${fillHeight ? ' l2-condition-fill' : ''}${readOnly ? ' l2-condition--readonly' : ''}${canvasEmbed ? ' l2-condition--canvas' : ''}`}
    >
      {paramLockHint ? (
        <p className="l2-param-lock-banner" title={paramLockHint}>
          Showing live Parameter values — locked settings change when you flip the Parameter.
        </p>
      ) : null}
      <div className="l2-condition-body">
        {node.type === 'text' && (
          <div className="l2-condition-stack">
            <ConditionHead
              title="Text (legacy)"
              onRemove={onRemove}
              showRemove={showRemove}
            />
            <select
              disabled={locked('op')}
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
              disabled={locked('value')}
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
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as typeof node.op),
                    )
                  }
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <div className="l2-condition-keyword-controls">
              <KeywordMatchToggles
                caseSensitive={node.caseSensitive}
                wholeWord={node.wholeWord}
                onChange={({ caseSensitive, wholeWord }) =>
                  onChange({ ...node, caseSensitive, wholeWord })
                }
                caseSensitiveReadOnly={locked('caseSensitive')}
                wholeWordReadOnly={locked('wholeWord')}
              />
              <SearchFieldPicker
                fields={node.fields}
                onChange={(fields) => onChange({ ...node, fields })}
                readOnly={locked('fields')}
              />
            </div>
            <div
              ref={termScroll.scrollRef}
              className={`term-list-scroll scrollbar-modern${fillHeight ? ' term-list-scroll--fill' : ''}`}
            >
              <span className="l2-param-list-section-label">Node terms (always on)</span>
              <TermListEditor
                terms={node.terms}
                onChange={(terms) => onChange({ ...node, terms })}
                placeholder="fema"
                searchable
                caseSensitive={node.caseSensitive === true}
                readOnly={locked('terms')}
              />
            </div>
            {liveListFor('terms') ? (
              <div className="l2-param-live-list">
                <span className="l2-param-list-section-label">
                  Live terms (with Parameters) — read only
                </span>
                <TermListEditor
                  terms={liveListFor('terms')!.effective}
                  onChange={() => undefined}
                  placeholder="term"
                  itemNoun="term"
                  readOnly
                />
              </div>
            ) : null}
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
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as typeof node.op),
                    )
                  }
                >
                  <option value="matches">matches</option>
                  <option value="not_matches">not matches</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <div className="option-toggle-list">
              <ToggleRow
                label="Case insensitive"
                checked={node.caseInsensitive !== false}
                onChange={(checked) => onChange({ ...node, caseInsensitive: checked })}
                ariaLabel="Case insensitive regex matching"
                readOnly={locked('caseInsensitive')}
              />
            </div>
            <SearchFieldPicker
              fields={node.fields}
              onChange={(fields) => onChange({ ...node, fields })}
              readOnly={locked('fields')}
            />
            <RegexPatternEditor
              pattern={node.pattern}
              caseInsensitive={node.caseInsensitive !== false}
              onChange={(pattern) => onChange({ ...node, pattern })}
              readOnly={locked('pattern')}
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
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as typeof node.op),
                    )
                  }
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <p className="l2-condition-hint">Matches #hashtag facets only — not plain text in the body.</p>
            <div className="term-list-scroll scrollbar-modern l2-hashtag-terms-scroll">
              <span className="l2-param-list-section-label">Node tags (always on)</span>
              <TermListEditor
                terms={node.tags}
                onChange={(tags) => onChange({ ...node, tags })}
                placeholder="fema"
                searchable
                stripHash
                itemNoun="hashtag"
                readOnly={locked('tags')}
              />
            </div>
            {liveListFor('tags') ? (
              <div className="l2-param-live-list">
                <span className="l2-param-list-section-label">
                  Live tags (with Parameters) — read only
                </span>
                <TermListEditor
                  terms={liveListFor('tags')!.effective}
                  onChange={() => undefined}
                  placeholder="tag"
                  itemNoun="hashtag"
                  stripHash
                  readOnly
                />
              </div>
            ) : null}
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
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as typeof node.op),
                    )
                  }
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <p className="l2-condition-hint">
              Substring match on URLs only — link card, body facets, or bridged source. Not post text.
            </p>
            <KeywordMatchToggles
              caseSensitive={node.caseSensitive}
              wholeWord={false}
              onChange={({ caseSensitive }) => onChange({ ...node, caseSensitive })}
              caseSensitiveReadOnly={locked('caseSensitive')}
            />
            <UrlSourcePicker
              sources={node.sources}
              onChange={(sources) => onChange({ ...node, sources })}
              readOnly={locked('sources')}
            />
            <div className="term-list-scroll scrollbar-modern">
              <span className="l2-param-list-section-label">Node URL patterns (always on)</span>
              <TermListEditor
                terms={node.patterns}
                onChange={(patterns) => onChange({ ...node, patterns })}
                placeholder="nytimes.com"
                searchable
                caseSensitive={node.caseSensitive === true}
                itemNoun="URL pattern"
                readOnly={locked('patterns')}
              />
            </div>
            {liveListFor('patterns') ? (
              <div className="l2-param-live-list">
                <span className="l2-param-list-section-label">
                  Live URL patterns (with Parameters) — read only
                </span>
                <TermListEditor
                  terms={liveListFor('patterns')!.effective}
                  onChange={() => undefined}
                  placeholder="pattern"
                  itemNoun="URL pattern"
                  readOnly
                />
              </div>
            ) : null}
          </div>
        )}

        {node.type === 'media' && (
          <div className="l2-condition-stack">
            <ConditionHead
              title="Media"
              onRemove={onRemove}
              showRemove={showRemove}
              trailing={
                <select
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as typeof node.op),
                    )
                  }
                >
                  <option value="is">is</option>
                  <option value="is_not">is not</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <p className="l2-condition-hint">
              Match if any selected kind is present (OR). Video excludes GIFs; Quote is plain quote only.
            </p>
            <MediaKindPicker node={node} onChange={onChange} readOnly={locked('kinds')} />
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
                  disabled={locked('unknown')}
                  value={node.unknown}
                  onChange={(e) =>
                    onChange({ ...node, unknown: e.target.value as 'include' | 'exclude' })
                  }
                  title="When the post has no language tag"
                >
                  <option value="exclude">unknown: exclude</option>
                  <option value="include">unknown: include</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <LanguagePicker
              allow={node.allow}
              onChange={(allow) => onChange({ ...node, allow })}
              readOnly={locked('allow')}
            />
          </div>
        )}

        {node.type === 'post_kind' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Post type" onRemove={onRemove} showRemove={showRemove} />
            <select
              disabled={locked('op')}
              value={node.op}
              onChange={(e) =>
                onChange(
                  withOpAndIngestRole(node, e.target.value as L2PostKindCondition['op']),
                )
              }
            >
              <option value="is">is</option>
              <option value="is_not">is not</option>
            </select>
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
            />
            <PostKindPicker node={node} onChange={onChange} readOnly={locked('kinds')} />
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
                  disabled={locked('op')}
                  value={node.op}
                  onChange={(e) =>
                    onChange(
                      withOpAndIngestRole(node, e.target.value as 'includes' | 'excludes'),
                    )
                  }
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <IngestDiscoverFilterField
              node={node}
              onChange={onChange}
              readOnly={locked('runAtIngest')}
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
              onChange={(e) => {
                const op = e.target.value as typeof node.op
                onChange({
                  ...node,
                  op,
                  // not_in_list is Filter-only
                  ...(op === 'not_in_list' ? { role: 'filter' as const } : {}),
                })
              }}
            >
              <option value="in_list">in list</option>
              <option value="not_in_list">not in list</option>
            </select>
            {node.op === 'in_list' ? (
              <label>
                Mode
                <select
                  disabled={readOnly}
                  value={node.role ?? 'discover'}
                  onChange={(e) =>
                    onChange({
                      ...node,
                      role: e.target.value as 'filter' | 'discover',
                    })
                  }
                >
                  <option value="discover">
                    Discover (list members can enter the pool)
                  </option>
                  <option value="filter">
                    Filter (only allow posts already in play from these authors)
                  </option>
                </select>
              </label>
            ) : null}
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
                feedId={feedId}
                onRefreshList={onRefreshList}
                onListCacheInvalidate={onListsChanged}
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
                  onChange={(e) => {
                    const op = e.target.value as typeof node.op
                    onChange({
                      ...node,
                      op,
                      ...(op === 'excludes' ? { role: 'filter' as const } : {}),
                    })
                  }}
                >
                  <option value="includes">includes</option>
                  <option value="excludes">excludes</option>
                </select>
              }
            />
            <p className="l2-condition-hint">
              Matches @mention facets — not the post author, not plain @text without a facet.
            </p>
            <label>
              Mode
              <select
                disabled={readOnly || node.op === 'excludes'}
                value={node.op === 'excludes' ? 'filter' : (node.role ?? 'discover')}
                onChange={(e) =>
                  onChange({
                    ...node,
                    role: e.target.value as 'filter' | 'discover',
                  })
                }
              >
                <option value="filter">Filter (only gate posts already in play)</option>
                <option value="discover">
                  Discover (pull posts that mention these accounts into the pool)
                </option>
              </select>
            </label>
            {node.op !== 'excludes' && (node.role ?? 'discover') === 'discover' ? (
              <p className="l2-condition-hint">
                Discover matches posts whose facets @-mention any of these accounts (or list
                members) and pulls them into the project pool at ingest.
              </p>
            ) : null}
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
                  onChange={(e) => {
                    const op = e.target.value as typeof node.op
                    onChange({
                      ...node,
                      op,
                      ...(op === 'excludes' ? { role: 'filter' as const } : {}),
                    })
                  }}
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
              Mode
              <select
                disabled={readOnly || node.op === 'excludes'}
                value={node.op === 'excludes' ? 'filter' : (node.role ?? 'filter')}
                onChange={(e) =>
                  onChange({
                    ...node,
                    role: e.target.value as 'filter' | 'discover',
                    // Discover only works with account hub
                    hubSource: e.target.value === 'discover' ? 'account' : node.hubSource,
                  })
                }
              >
                <option value="filter">Filter (only allow posts from ring members)</option>
                <option value="discover">
                  Discover (ring members can enter the pool + recent-post poll)
                </option>
              </select>
            </label>
            <label>
              Hub source
              <select
                disabled={readOnly || node.role === 'discover'}
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

        {node.type === 'substitute' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Substitute" onRemove={onRemove} showRemove={showRemove} />
            <label className="l2-condition-field">
              Direction
              <select
                value={node.direction}
                onChange={(e) => onChange({ ...node, direction: e.target.value as 'reply_to_root' | 'reply_to_parent' | 'quote_to_quoted' | 'quoted_to_quoters' | 'replied_to_repliers' })}
                disabled={readOnly}
              >
                <option value="reply_to_root">Reply → Root post</option>
                <option value="reply_to_parent">Reply → Parent post</option>
                <option value="quote_to_quoted">Quote → Quoted post</option>
                <option value="quoted_to_quoters">Pool post quoted → Pull in quoters</option>
                <option value="replied_to_repliers">Pool post replied → Pull in repliers</option>
              </select>
            </label>
            <label className="l2-condition-field">
              {node.direction === 'quoted_to_quoters' ? 'Quotes needed' : node.direction === 'replied_to_repliers' ? 'Replies needed' : node.direction === 'quote_to_quoted' ? 'Matching quotes needed' : 'Matching replies needed'}
              <input
                type="number"
                min={1}
                max={100}
                value={node.threshold}
                onChange={(e) => onChange({ ...node, threshold: Math.max(1, Number(e.target.value) || 1) })}
                disabled={readOnly}
              />
            </label>
            <label className="l2-condition-field">
              Recency window (hours, 0 = no expiry)
              <input
                type="number"
                min={0}
                value={node.timeWindowHours ?? 0}
                onChange={(e) => onChange({ ...node, timeWindowHours: Math.max(0, Number(e.target.value) || 0) })}
                disabled={readOnly}
              />
            </label>
            <p className="card-hint">
              {node.direction === 'quoted_to_quoters'
                ? `When a pool post accumulates ${node.threshold} quote(s)${node.timeWindowHours ? ` within ${node.timeWindowHours}h` : ''}, those quote posts enter the feed.`
                : node.direction === 'replied_to_repliers'
                  ? `When a pool post accumulates ${node.threshold} repl${node.threshold === 1 ? 'y' : 'ies'}${node.timeWindowHours ? ` within ${node.timeWindowHours}h` : ''}, those reply posts enter the feed.`
                  : node.direction === 'quote_to_quoted'
                    ? `When ${node.threshold} matching quote(s) reference a post${node.timeWindowHours ? ` within ${node.timeWindowHours}h` : ''}, that quoted post enters the feed.`
                    : `When ${node.threshold} matching repl${node.threshold === 1 ? 'y' : 'ies'} to a post arrive${node.timeWindowHours ? ` within ${node.timeWindowHours}h` : ''}, the ${node.direction === 'reply_to_root' ? 'root' : 'parent'} post enters the feed.`
              }
            </p>
          </div>
        )}

        {node.type === 'scout' && (
          <div className="l2-condition-stack">
            <ConditionHead title="Scout discovery" onRemove={onRemove} showRemove={showRemove} />
            <label className="l2-condition-field">
              Scout source
              <select
                value={node.autoDerive ? 'auto' : 'manual'}
                onChange={(e) => {
                  if (e.target.value === 'auto') {
                    onChange({ ...node, autoDerive: { source: 'top_pool_authors', count: 10 } })
                  } else {
                    onChange({ ...node, autoDerive: undefined })
                  }
                }}
                disabled={readOnly}
              >
                <option value="manual">Manual (specify accounts)</option>
                <option value="auto">Auto-derive from pool</option>
              </select>
            </label>
            {node.autoDerive && (
              <>
                <label className="l2-condition-field">
                  Derive from
                  <select
                    value={node.autoDerive.source}
                    onChange={(e) => onChange({ ...node, autoDerive: { ...node.autoDerive!, source: e.target.value as 'top_pool_authors' | 'top_engagers' } })}
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
                    value={node.autoDerive.count}
                    onChange={(e) => onChange({ ...node, autoDerive: { ...node.autoDerive!, count: Math.max(1, Number(e.target.value) || 10) } })}
                    disabled={readOnly}
                  />
                </label>
                <p className="card-hint">Auto-derived scouts refresh every 6 hours. You can also add manual scouts below.</p>
              </>
            )}
            <label className="l2-condition-field">
              {node.autoDerive ? 'Additional scout accounts (optional)' : 'Scout accounts'}
            </label>
            <div className="term-list-scroll scrollbar-modern l2-scout-accounts-scroll">
              <TermListEditor
                terms={node.scouts ?? []}
                onChange={(scouts) => onChange({ ...node, scouts })}
                placeholder="did:plc:… or handle.bsky.social"
                searchable
                itemNoun="account"
                readOnly={readOnly}
              />
            </div>
            {!readOnly && (node.scouts ?? []).some(s => !s.startsWith('did:')) && (
              <p className="card-hint">Handles will be resolved to DIDs when the feed is saved.</p>
            )}
            <label className="l2-condition-field">
              Min scouts (fastest trigger)
              <input
                type="number"
                min={1}
                max={100}
                value={node.threshold.min}
                onChange={(e) => onChange({ ...node, threshold: { ...node.threshold, min: Math.max(1, Number(e.target.value) || 1) } })}
                disabled={readOnly}
              />
            </label>
            <label className="l2-condition-field">
              Max scouts (always triggers)
              <input
                type="number"
                min={1}
                max={100}
                value={node.threshold.max}
                onChange={(e) => onChange({ ...node, threshold: { ...node.threshold, max: Math.max(1, Number(e.target.value) || 1) } })}
                disabled={readOnly}
              />
            </label>
            <label className="l2-condition-field">
              Scale window (minutes)
              <input
                type="number"
                min={1}
                value={node.threshold.scaleWindowMinutes}
                onChange={(e) => onChange({ ...node, threshold: { ...node.threshold, scaleWindowMinutes: Math.max(1, Number(e.target.value) || 60) } })}
                disabled={readOnly}
              />
            </label>
            <label className="l2-condition-field">
              Curve
              <select
                value={node.threshold.curve}
                onChange={(e) => onChange({ ...node, threshold: { ...node.threshold, curve: e.target.value as 'linear' | 'curved' } })}
                disabled={readOnly}
              >
                <option value="linear">Linear</option>
                <option value="curved">Curved (rewards early bursts)</option>
              </select>
            </label>
            {node.threshold.curve === 'curved' && (
              <label className="l2-condition-field">
                Exponent
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={node.threshold.exponent ?? 1.5}
                  onChange={(e) => onChange({ ...node, threshold: { ...node.threshold, exponent: Number(e.target.value) || 1.5 } })}
                  disabled={readOnly}
                />
              </label>
            )}
            <label className="l2-condition-field">
              Max post age (hours, 0 = unlimited)
              <input
                type="number"
                min={0}
                value={node.maxPostAgeHours ?? 48}
                onChange={(e) => onChange({ ...node, maxPostAgeHours: Math.max(0, Number(e.target.value) || 0) })}
                disabled={readOnly}
              />
            </label>
            <p className="card-hint">
              When {node.threshold.min}–{node.threshold.max} distinct scouts interact with the same post (scaling over {node.threshold.scaleWindowMinutes} min), that post is fetched and evaluated through your feed rules.
            </p>
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

/** Badge for nodes that participate in strict-mode ingest extraction. */
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

function MediaKindPicker({
  node,
  onChange,
  readOnly = false,
}: {
  node: Extract<L2RuleNode, { type: 'media' }>
  onChange: (node: L2RuleNode) => void
  readOnly?: boolean
}) {
  const toggle = (kind: L2MediaKind) => {
    const set = new Set(node.kinds)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    onChange({ ...node, kinds: L2_MEDIA_KINDS.filter((k) => set.has(k)) })
  }

  return (
    <div className="option-toggle-list l2-post-kind-toggle-list">
      {L2_MEDIA_KINDS.map((kind) => (
        <ToggleRow
          key={kind}
          label={mediaKindLabel(kind)}
          checked={node.kinds.includes(kind)}
          onChange={() => toggle(kind)}
          ariaLabel={`Media ${mediaKindLabel(kind)}`}
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
