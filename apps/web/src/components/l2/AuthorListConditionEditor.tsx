import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AuthorListConfig,
  FeedAuthorListConfig,
  L2AuthorCondition,
} from '@cfb/core-types'
import { api, type ListCacheEntry } from '../../api/client'
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
  feedId?: string
  onRefreshList?: (listId: string) => Promise<void>
  /** Called after ensure so parent can merge cache rows. */
  onListCacheInvalidate?: () => void | Promise<void>
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
  feedId,
  onRefreshList,
  onListCacheInvalidate,
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
  const [ensuring, setEnsuring] = useState(false)
  const [ensureError, setEnsureError] = useState<string | null>(null)
  const ensureSeq = useRef(0)

  const cacheForList = (id: string | undefined) =>
    id
      ? projectListCache.find(
          (c) => c.listId === id || c.graphUri === id || c.remotePollKey === id,
        )
      : undefined

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
    setEnsureError(null)
    onChange({ ...node, listId: entry.listId })
  }

  const applyListUri = (uri: string) => {
    const trimmed = uri.trim()
    setDraftUri(uri)
    setEnsureError(null)
    if (!trimmed || !remotePollKeyForUri(trimmed)) return

    const working = draftList ?? linkedFeed ?? newFeedAuthorList(feedAuthorLists, { feedId })
    const dup = findDuplicateAuthorList(
      trimmed,
      registered.filter((r) => r.listId !== working.listId),
    )
    if (dup) {
      adoptDuplicate(dup)
      return
    }

    const seq = ++ensureSeq.current
    setEnsuring(true)
    void (async () => {
      try {
        const ensured = await api.ensureList(trimmed, projectId)
        if (seq !== ensureSeq.current) return

        const existingSame = registered.find(
          (r) =>
            r.listId === ensured.listId ||
            r.remotePollKey === ensured.graphUri ||
            r.remotePollKey === ensured.listId,
        )
        if (existingSame && existingSame.listId !== working.listId) {
          adoptDuplicate(existingSame)
          await onListCacheInvalidate?.()
          return
        }

        const sourceType =
          ensured.listKind === 'starterpack' ? 'bluesky_starter_pack' : 'bluesky_list'
        const sourceUri =
          ensured.listKind === 'starterpack' ? trimmed : ensured.graphUri

        const nextList: FeedAuthorListConfig = {
          listId: ensured.listId,
          sources: [{ type: sourceType, uri: sourceUri, pollIntervalMinutes: 60 }],
          pollIntervalMinutes: 60,
          dids: undefined,
        }
        // Drop provisional fl-* row if we had one.
        const others = feedAuthorLists.filter(
          (l) => l.listId !== working.listId && l.listId !== nextList.listId,
        )
        commitFeedList([...others, nextList], { ...node, listId: nextList.listId })
        setDraftList(nextList)
        setEditingList(false)
        await onListCacheInvalidate?.()
      } catch (e) {
        if (seq !== ensureSeq.current) return
        setEnsureError(e instanceof Error ? e.message : 'Failed to resolve list')
      } finally {
        if (seq === ensureSeq.current) setEnsuring(false)
      }
    })()
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
    setEnsureError(null)
  }

  const startEditList = () => {
    if (linkedFeed) {
      setDraftList(linkedFeed)
      setDraftUri(listSourceUri(linkedFeed))
    } else if (projectList) {
      setDraftList(newFeedAuthorList(feedAuthorLists, { feedId }))
      setDraftUri(listSourceUri(projectList))
    } else {
      setDraftList(newFeedAuthorList(feedAuthorLists, { feedId }))
      setDraftUri('')
    }
    setEditingList(true)
  }

  const linkProjectList = (listId: string) => {
    if (!listId) return
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

  useEffect(() => {
    if (hasLinkedList) setEditingList(false)
  }, [hasLinkedList, node.listId])

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

        {showSummary ? null : (
          <div className="l2-author-list-feed-form">
            <label>
              List, mod list, or starter-pack URL
              <input
                value={draftUri}
                onChange={(e) => applyListUri(e.target.value)}
                placeholder="https://bsky.app/profile/…/lists/…"
                disabled={ensuring}
              />
            </label>
            {ensuring ? <p className="l2-condition-hint">Resolving list…</p> : null}
            {ensureError ? <p className="field-error">{ensureError}</p> : null}
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
                Paste a URL to attach. Curation lists, moderation lists, and starter packs are
                treated the same — membership is shared by the backing list.
              </p>
            )}
          </div>
        )}

        {node.listId ? (
          <AuthorListMembersPanel
            listId={node.listId}
            uri={summaryUri}
            cache={cacheForList(node.listId)}
            onRefreshList={onRefreshList}
          />
        ) : null}
      </div>

      <AuthorDidListEditor
        label="Extra authors"
        dids={node.dids ?? []}
        onChange={(dids) =>
          onChange({
            ...node,
            dids: dids.length ? dids : undefined,
          })
        }
        hint={
          node.listId
            ? 'Press Enter to add. Matched in addition to the Bluesky list above.'
            : 'Press Enter to add. Attach a Bluesky list above to include a whole list too.'
        }
      />

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
