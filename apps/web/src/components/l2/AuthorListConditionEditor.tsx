import { useMemo, useState } from 'react'
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
  isProjectAuthorList,
  listSourceUri,
  newFeedAuthorList,
  remotePollKeyForUri,
  type AuthorListScope,
} from '../../lib/author-lists'
import { AuthorListMembersPanel } from './AuthorListMembersPanel'
import { AuthorDidListEditor } from './AuthorDidListEditor'
import { AuthorListSourceSummary } from './AuthorListSourceSummary'
import { ToggleRow } from '../ToggleRow'

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

function listDisplayTitle(listId: string, cache: ListCacheEntry | undefined): string {
  return cache?.graphName?.trim() || listId
}

function ingestionOptionLabel(listId: string, cache: ListCacheEntry | undefined): string {
  const label = cache?.graphName?.trim() || listId
  if (cache?.memberCount != null) return `${label} (${cache.memberCount} members)`
  return label
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

  const linkedFeed = linkedFeedList(node, feedAuthorLists)
  const isProject = isProjectAuthorList(node.listId, projectAuthorLists)
  const projectList = isProject
    ? projectAuthorLists.find((l) => l.listId === node.listId)
    : undefined
  const hasLinkedList = Boolean(node.listId && (linkedFeed || projectList))

  /** Edit URI / swap list — open when nothing linked yet, or after Edit. */
  const [editingList, setEditingList] = useState(!hasLinkedList)
  const [draftUri, setDraftUri] = useState(() =>
    linkedFeed ? listSourceUri(linkedFeed) : '',
  )
  const [draftList, setDraftList] = useState<FeedAuthorListConfig | null>(
    () => linkedFeed ?? null,
  )

  const cacheForList = (id: string | undefined) =>
    id ? projectListCache.find((c) => c.listId === id) : undefined

  const commitFeedList = (lists: FeedAuthorListConfig[], nextNode: L2AuthorCondition) => {
    if (onAuthorFeedUpdate) {
      onAuthorFeedUpdate(lists, nextNode)
      return
    }
    onFeedAuthorListsChange(lists)
    onChange(nextNode)
  }

  const saveFeedList = (list: FeedAuthorListConfig, nextNode: L2AuthorCondition) => {
    setDraftList(list)
    if (!feedAuthorListHasContent(list)) {
      onChange({ ...nextNode, listId: undefined })
      return
    }
    const others = feedAuthorLists.filter((l) => l.listId !== list.listId)
    commitFeedList([...others, list], nextNode)
  }

  const adoptDuplicate = (entry: { listId: string; scope: AuthorListScope }) => {
    setDraftList(null)
    setDraftUri('')
    setEditingList(false)
    onChange({ ...node, listId: entry.listId })
  }

  const applyListUri = (uri: string) => {
    const trimmed = uri.trim()
    setDraftUri(uri)
    // Wait until the URL/URI parses as a Bluesky list or starter pack.
    if (!trimmed || !remotePollKeyForUri(trimmed)) return

    const working = draftList ?? linkedFeed ?? newFeedAuthorList(feedAuthorLists)
    const dup = findDuplicateAuthorList(
      trimmed,
      registered.filter((r) => r.listId !== working.listId),
    )
    if (dup) {
      adoptDuplicate(dup)
      return
    }

    const nextList: FeedAuthorListConfig = {
      ...working,
      sources: [{ type: 'bluesky_list', uri: trimmed, pollIntervalMinutes: 60 }],
      // Extra accounts live on the condition node (union at eval), not on the list def.
      dids: undefined,
    }
    saveFeedList(nextList, { ...node, listId: nextList.listId })
    setEditingList(false)
  }

  const clearList = () => {
    const prevId = node.listId
    onChange({ ...node, listId: undefined })
    if (prevId && isFeedAuthorList(prevId, feedAuthorLists)) {
      onFeedAuthorListsChange(feedAuthorLists.filter((l) => l.listId !== prevId))
    }
    setDraftList(null)
    setDraftUri('')
    setEditingList(true)
  }

  const startEditList = () => {
    if (linkedFeed) {
      setDraftList(linkedFeed)
      setDraftUri(listSourceUri(linkedFeed))
    } else if (projectList) {
      setDraftList(newFeedAuthorList(feedAuthorLists))
      setDraftUri(listSourceUri(projectList))
    } else {
      setDraftList(newFeedAuthorList(feedAuthorLists))
      setDraftUri('')
    }
    setEditingList(true)
  }

  const linkProjectList = (listId: string) => {
    if (!listId) return
    // Drop unused feed-only def if we were pointing at one.
    const prevId = node.listId
    if (prevId && isFeedAuthorList(prevId, feedAuthorLists) && prevId !== listId) {
      onFeedAuthorListsChange(feedAuthorLists.filter((l) => l.listId !== prevId))
    }
    setDraftList(null)
    setDraftUri('')
    setEditingList(false)
    onChange({ ...node, listId })
  }

  const showSummary = hasLinkedList && !editingList
  const summaryTitle = projectList
    ? listDisplayTitle(projectList.listId, cacheForList(projectList.listId))
    : node.listId
      ? listDisplayTitle(node.listId, cacheForList(node.listId))
      : ''
  const summaryUri = projectList
    ? listSourceUri(projectList) || undefined
    : linkedFeed
      ? listSourceUri(linkedFeed) || undefined
      : undefined

  const duplicateUri =
    editingList && draftUri.trim()
      ? findDuplicateAuthorList(
          draftUri,
          registered.filter((r) => r.listId !== (draftList ?? linkedFeed)?.listId),
        )
      : null

  return (
    <div className="l2-author-list-editor">
      <div className="l2-author-list-section">
        <div className="l2-author-list-section-head">
          <span className="l2-author-list-section-label">Bluesky list</span>
          {showSummary ? (
            <span className="l2-author-list-section-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={startEditList}
              >
                Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearList}>
                Remove
              </button>
            </span>
          ) : null}
        </div>

        {showSummary ? (
          <div className="l2-author-list-feed-form">
            <AuthorListSourceSummary title={summaryTitle} uri={summaryUri} />
            {isProject ? (
              <p className="l2-condition-hint">
                Linked to an L1 project list (used for pool ingestion). Same list can also gate this
                feed&apos;s Author rule.
              </p>
            ) : (
              <p className="l2-condition-hint">
                Feed-scoped list: polled for this feed&apos;s Author rules only. Separate from L1
                project lists that filter what enters the ingestion pool.
              </p>
            )}
          </div>
        ) : (
          <div className="l2-author-list-feed-form">
            <label>
              List or starter-pack URL
              <input
                value={draftUri}
                onChange={(e) => applyListUri(e.target.value)}
                placeholder="https://bsky.app/profile/…/lists/…"
              />
            </label>
            {projectAuthorLists.length > 0 ? (
              <label>
                Or use an L1 ingestion list
                <select
                  value={isProject ? (node.listId ?? '') : ''}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v) linkProjectList(v)
                  }}
                >
                  <option value="">—</option>
                  {projectAuthorLists.map((list) => {
                    const cache = projectListCache.find((c) => c.listId === list.listId)
                    return (
                      <option key={list.listId} value={list.listId}>
                        {ingestionOptionLabel(list.listId, cache)}
                      </option>
                    )
                  })}
                </select>
              </label>
            ) : null}
            {hasLinkedList ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingList(false)}>
                Cancel
              </button>
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
                Paste a URL to attach a list. Extra accounts go in DIDs below — both are unioned at
                match time.
              </p>
            )}
          </div>
        )}
      </div>

      <AuthorDidListEditor
        label="Author DIDs"
        dids={node.dids ?? []}
        onChange={(dids) =>
          onChange({
            ...node,
            dids: dids.length ? dids : undefined,
          })
        }
        hint={
          node.listId
            ? 'Optional extras — unioned with the list members at evaluation time.'
            : 'Match these accounts. Add a Bluesky list above if you also want list members.'
        }
      />

      {node.listId ? (
        <AuthorListMembersPanel
          listId={node.listId}
          extraDids={node.dids}
          cache={cacheForList(node.listId)}
          onRefreshList={onRefreshList}
        />
      ) : (node.dids?.length ?? 0) > 0 ? (
        <AuthorListMembersPanel manualDids={node.dids} />
      ) : null}

      {prefilterMode && node.op === 'in_list' ? (
        <ToggleRow
          label="Authors only"
          hint="Block everyone not on this list — strangers won't enter the pool (manual ingest only)"
          checked={node.authorsOnly ?? false}
          onChange={(checked) => onChange({ ...node, authorsOnly: checked || undefined })}
          ariaLabel="Authors only ingest"
        />
      ) : null}
    </div>
  )
}
