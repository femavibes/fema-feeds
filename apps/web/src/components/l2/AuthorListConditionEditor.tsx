import { useEffect, useMemo, useState } from 'react'
import type {
  AuthorListConfig,
  FeedAuthorListConfig,
  L2AuthorCondition,
} from '@cfb/core-types'
import type { ListCacheEntry } from '../../api/client'
import {
  collectRegisteredLists,
  feedAuthorListHasContent,
  findDuplicateAuthorList,
  isFeedAuthorList,
  listManualDids,
  listSourceUri,
  newFeedAuthorList,
  remotePollKeyForUri,
  type AuthorListScope,
} from '../../lib/author-lists'
import { AuthorListMembersPanel } from './AuthorListMembersPanel'
import { AuthorDidListEditor } from './AuthorDidListEditor'
import { AuthorListSourceSummary } from './AuthorListSourceSummary'
import { ToggleRow } from '../ToggleRow'

const MANUAL = '__manual__'
const NEW_LIST = '__new__'

interface Props {
  node: L2AuthorCondition
  onChange: (node: L2AuthorCondition) => void
  projectAuthorLists: AuthorListConfig[]
  feedAuthorLists: FeedAuthorListConfig[]
  onFeedAuthorListsChange: (lists: FeedAuthorListConfig[]) => void
  onAuthorFeedUpdate?: (lists: FeedAuthorListConfig[], node: L2AuthorCondition) => void
  listCache: ListCacheEntry[]
  projectId: string
  onRefreshList?: (listId: string) => Promise<void>
  /** Project prefilter editor — authors-only applies at Jetstream ingest. */
  prefilterMode?: boolean
}

function scopeLabel(scope: AuthorListScope): string {
  switch (scope) {
    case 'project':
      return 'ingestion pool'
    case 'feed':
      return 'this feed'
    case 'deployment':
      return 'another project'
  }
}

function linkedFeedList(
  node: L2AuthorCondition,
  feedAuthorLists: FeedAuthorListConfig[],
): FeedAuthorListConfig | undefined {
  if (!node.listId) return undefined
  return feedAuthorLists.find((l) => l.listId === node.listId)
}

function isProjectList(
  value: string,
  projectAuthorLists: AuthorListConfig[],
): boolean {
  return projectAuthorLists.some((l) => l.listId === value)
}

function deriveSourceMode(
  node: L2AuthorCondition,
  projectAuthorLists: AuthorListConfig[],
  feedAuthorLists: FeedAuthorListConfig[],
): string {
  if (node.listId && isProjectList(node.listId, projectAuthorLists)) return node.listId
  if (!node.listId && (node.dids?.length ?? 0) > 0) return MANUAL
  if (node.listId && isFeedAuthorList(node.listId, feedAuthorLists)) return NEW_LIST
  return NEW_LIST
}

function ingestionOptionLabel(
  listId: string,
  cache: ListCacheEntry | undefined,
): string {
  const label = cache?.graphName?.trim() || listId
  if (cache?.memberCount != null) return `${label} (${cache.memberCount} members)`
  return label
}

function listDisplayTitle(
  listId: string,
  cache: ListCacheEntry | undefined,
): string {
  return cache?.graphName?.trim() || listId
}

export function AuthorListConditionEditor({
  node,
  onChange,
  projectAuthorLists,
  feedAuthorLists,
  onFeedAuthorListsChange,
  onAuthorFeedUpdate,
  listCache,
  projectId,
  onRefreshList,
  prefilterMode = false,
}: Props) {
  const projectListCache = useMemo(
    () => listCache.filter((l) => l.projectId === projectId),
    [listCache, projectId],
  )

  const registered = useMemo(
    () =>
      collectRegisteredLists({
        projectLists: projectAuthorLists,
        feedLists: feedAuthorLists,
        listCache: projectListCache,
        projectId,
      }),
    [projectAuthorLists, feedAuthorLists, projectListCache, projectId],
  )

  const [listNameConflict, setListNameConflict] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState(() =>
    deriveSourceMode(node, projectAuthorLists, feedAuthorLists),
  )

  const [feedEditorList, setFeedEditorList] = useState<FeedAuthorListConfig | null>(() => {
    const linked = linkedFeedList(node, feedAuthorLists)
    if (linked) return linked
    if (deriveSourceMode(node, projectAuthorLists, feedAuthorLists) === NEW_LIST) {
      return newFeedAuthorList(feedAuthorLists)
    }
    return null
  })

  useEffect(() => {
    if (node.listId && isProjectList(node.listId, projectAuthorLists)) {
      setSourceMode(node.listId)
      setFeedEditorList(null)
      return
    }
    if (!node.listId && (node.dids?.length ?? 0) > 0) {
      setSourceMode(MANUAL)
      setFeedEditorList(null)
      return
    }
    if (node.listId && isFeedAuthorList(node.listId, feedAuthorLists)) {
      setSourceMode(NEW_LIST)
      const linked = linkedFeedList(node, feedAuthorLists)
      if (linked) setFeedEditorList(linked)
      return
    }
    if (sourceMode === NEW_LIST) {
      setFeedEditorList((prev) => prev ?? newFeedAuthorList(feedAuthorLists))
    }
  }, [node.listId, node.dids, feedAuthorLists, projectAuthorLists, sourceMode])

  const projectList =
    sourceMode !== NEW_LIST &&
    sourceMode !== MANUAL &&
    isProjectList(sourceMode, projectAuthorLists)
      ? projectAuthorLists.find((l) => l.listId === sourceMode)
      : undefined

  const commitFeedList = (lists: FeedAuthorListConfig[], nextNode: L2AuthorCondition) => {
    if (onAuthorFeedUpdate) {
      onAuthorFeedUpdate(lists, nextNode)
      return
    }
    onFeedAuthorListsChange(lists)
    onChange(nextNode)
  }

  const saveFeedList = (
    list: FeedAuthorListConfig,
    nextNode: L2AuthorCondition = { ...node, listId: list.listId, dids: undefined },
  ) => {
    setFeedEditorList(list)
    if (!feedAuthorListHasContent(list)) {
      onChange({ ...nextNode, listId: undefined })
      return
    }
    const others = feedAuthorLists.filter((l) => l.listId !== list.listId)
    commitFeedList([...others, list], nextNode)
  }

  const adoptDuplicate = (entry: { listId: string; scope: AuthorListScope }) => {
    setListNameConflict(null)
    setFeedEditorList(null)
    setSourceMode(entry.listId)
    onChange({ ...node, listId: entry.listId, dids: undefined })
  }

  const handleFeedListUri = (list: FeedAuthorListConfig, uri: string) => {
    const dup = findDuplicateAuthorList(uri, registered.filter((r) => r.listId !== list.listId))
    if (dup && remotePollKeyForUri(uri)) {
      adoptDuplicate(dup)
      return
    }
    saveFeedList({
      ...list,
      sources: [{ type: 'bluesky_list', uri, pollIntervalMinutes: 60 }],
    })
  }

  const feedFormList =
    sourceMode === NEW_LIST
      ? (linkedFeedList(node, feedAuthorLists) ?? feedEditorList)
      : null

  const duplicateUri =
    feedFormList && listSourceUri(feedFormList).trim()
      ? findDuplicateAuthorList(
          listSourceUri(feedFormList),
          registered.filter((r) => r.listId !== feedFormList.listId),
        )
      : null

  const cacheForList = (id: string | undefined) =>
    id ? projectListCache.find((c) => c.listId === id) : undefined

  const handleListSelect = (value: string) => {
    setListNameConflict(null)
    setSourceMode(value)

    if (value === MANUAL) {
      setFeedEditorList(null)
      onChange({ ...node, listId: undefined, dids: node.dids ?? [] })
      return
    }

    if (value === NEW_LIST) {
      const created = newFeedAuthorList(feedAuthorLists)
      setFeedEditorList(created)
      onChange({ ...node, listId: undefined, dids: undefined })
      return
    }

    setFeedEditorList(null)
    onChange({ ...node, listId: value, dids: undefined })
  }

  return (
    <div className="l2-author-list-editor">
      <label>
        Source
        <select value={sourceMode} onChange={(e) => handleListSelect(e.target.value)}>
          <option value={NEW_LIST}>New list</option>
          {projectAuthorLists.length > 0 ? (
            <optgroup label="L1 ingestion">
              {projectAuthorLists.map((list) => {
                const cache = projectListCache.find((c) => c.listId === list.listId)
                return (
                  <option key={list.listId} value={list.listId}>
                    {ingestionOptionLabel(list.listId, cache)}
                  </option>
                )
              })}
            </optgroup>
          ) : null}
          <option value={MANUAL}>DIDs only</option>
        </select>
      </label>

      {projectList ? (
        <div className="l2-author-list-feed-form card">
          <AuthorListSourceSummary
            title={listDisplayTitle(projectList.listId, cacheForList(projectList.listId))}
            uri={listSourceUri(projectList) || undefined}
          />
          <AuthorListMembersPanel
            listId={projectList.listId}
            extraDids={node.dids}
            cache={cacheForList(projectList.listId)}
            onRefreshList={onRefreshList}
          />
          <AuthorDidListEditor
            label="Additional DIDs (optional)"
            dids={node.dids ?? []}
            onChange={(dids) =>
              onChange({
                ...node,
                listId: projectList.listId,
                dids: dids.length ? dids : undefined,
              })
            }
            hint="Unioned with the L1 list at evaluation time — for one-off accounts not on the list."
          />
        </div>
      ) : null}

      {feedFormList ? (
        <>
          <div className="l2-author-list-feed-form card">
            <label>
              List name
              <input
                value={feedFormList.listId}
                onChange={(e) => {
                  const nextId = e.target.value.trim()
                  setListNameConflict(null)
                  if (!nextId || nextId === feedFormList.listId) return
                  const taken = registered.some((r) => r.listId === nextId)
                  if (taken) {
                    setListNameConflict(nextId)
                    return
                  }
                  saveFeedList({ ...feedFormList, listId: nextId }, { ...node, listId: nextId })
                }}
                placeholder="vip-sources"
              />
            </label>
            {listNameConflict ? (
              <p className="field-error">
                The name <strong>{listNameConflict}</strong> is already used — pick a different label.
              </p>
            ) : null}
            <label>
              Bluesky list or starter-pack URL
              <input
                value={listSourceUri(feedFormList)}
                onChange={(e) => handleFeedListUri(feedFormList, e.target.value)}
                placeholder="https://bsky.app/profile/…/lists/…"
              />
            </label>
            <AuthorDidListEditor
              label="Additional DIDs (optional)"
              dids={listManualDids(feedFormList)}
              onChange={(dids) =>
                saveFeedList({
                  ...feedFormList,
                  dids: dids.length ? dids : undefined,
                  sources: (feedFormList.sources ?? []).filter((s) => s.type !== 'manual_dids'),
                })
              }
            />
          </div>

          {node.listId ? (
            <AuthorListMembersPanel
              listId={node.listId}
              extraDids={listManualDids(feedFormList)}
              cache={cacheForList(node.listId)}
              onRefreshList={onRefreshList}
            />
          ) : null}

          {duplicateUri ? (
            <p className="field-error">
              This Bluesky list is already registered as <strong>{duplicateUri.listId}</strong> (
              {scopeLabel(duplicateUri.scope)}). Reusing it avoids duplicate polling.
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => adoptDuplicate(duplicateUri)}
              >
                Use {duplicateUri.listId}
              </button>
            </p>
          ) : (
            <p className="l2-condition-hint">
              Feed-only — applies to this feed&apos;s rules, not L1 ingestion. Saved when you add a URL
              or DIDs.
            </p>
          )}
        </>
      ) : null}

      {sourceMode === MANUAL ? (
        <>
          <AuthorDidListEditor
            label="Author DIDs"
            dids={node.dids ?? []}
            onChange={(dids) =>
              onChange({
                ...node,
                listId: undefined,
                dids,
              })
            }
            hint="Match only these accounts — no Bluesky list."
          />
          <AuthorListMembersPanel manualDids={node.dids} />
        </>
      ) : null}

      {projectAuthorLists.length === 0 && sourceMode === NEW_LIST && !prefilterMode ? (
        <p className="l2-condition-hint">
          Feed-only list — saved with this feed. Use at L2 to narrow which pooled posts appear in this
          feed.
        </p>
      ) : null}

      {prefilterMode && node.op === 'in_list' ? (
        <ToggleRow
          label="Authors only"
          hint="Block everyone not on this list — strangers won't enter the pool"
          checked={node.authorsOnly ?? false}
          onChange={(checked) => onChange({ ...node, authorsOnly: checked || undefined })}
          ariaLabel="Authors only ingest"
        />
      ) : null}
    </div>
  )
}
