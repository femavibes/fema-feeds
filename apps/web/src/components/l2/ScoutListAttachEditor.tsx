import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthorListConfig, FeedAuthorListConfig, ScoutFeedSource } from '@cfb/core-types'
import { api, type ListCacheEntry } from '../../api/client'
import {
  collectRegisteredLists,
  findDuplicateAuthorList,
  isFeedAuthorList,
  isProjectAuthorList,
  listSourceUri,
  newFeedAuthorList,
  remotePollKeyForUri,
  type AuthorListScope,
} from '../../lib/author-lists'
import { AuthorListMembersPanel } from './AuthorListMembersPanel'

interface Props {
  scout: ScoutFeedSource
  onChange: (next: ScoutFeedSource) => void
  feedAuthorLists: FeedAuthorListConfig[]
  onFeedAuthorListsChange: (lists: FeedAuthorListConfig[]) => void
  onScoutFeedUpdate?: (lists: FeedAuthorListConfig[], scout: ScoutFeedSource) => void
  projectAuthorLists: AuthorListConfig[]
  listCache: ListCacheEntry[]
  projectId: string
  feedId?: string
  onRefreshList?: (listId: string) => Promise<void>
  onListCacheInvalidate?: () => void | Promise<void>
  readOnly?: boolean
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

function ingestionOptionLabel(listId: string, cache: ListCacheEntry | undefined): string {
  const label = cache?.graphName?.trim() || listId
  if (cache?.memberCount != null) return `${label} (${cache.memberCount} members)`
  return label
}

export function ScoutListAttachEditor({
  scout,
  onChange,
  feedAuthorLists,
  onFeedAuthorListsChange,
  onScoutFeedUpdate,
  projectAuthorLists,
  listCache,
  projectId,
  feedId,
  onRefreshList,
  onListCacheInvalidate,
  readOnly,
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

  const linkedFeed = scout.listId
    ? feedAuthorLists.find((l) => l.listId === scout.listId)
    : undefined
  const isProject = isProjectAuthorList(scout.listId, projectAuthorLists)
  const projectList = isProject
    ? projectAuthorLists.find((l) => l.listId === scout.listId)
    : undefined
  const hasLinkedList = Boolean(scout.listId && (linkedFeed || projectList))

  const [editingList, setEditingList] = useState(!hasLinkedList)
  const [draftUri, setDraftUri] = useState(() => (linkedFeed ? listSourceUri(linkedFeed) : ''))
  const [draftList, setDraftList] = useState<FeedAuthorListConfig | null>(() => linkedFeed ?? null)
  const [ensuring, setEnsuring] = useState(false)
  const [ensureError, setEnsureError] = useState<string | null>(null)
  const ensureSeq = useRef(0)

  const cacheForList = (id: string | undefined) =>
    id
      ? projectListCache.find(
          (c) => c.listId === id || c.graphUri === id || c.remotePollKey === id,
        )
      : undefined

  const commitFeedList = (lists: FeedAuthorListConfig[], nextScout: ScoutFeedSource) => {
    if (onScoutFeedUpdate) {
      onScoutFeedUpdate(lists, nextScout)
      return
    }
    onFeedAuthorListsChange(lists)
    onChange(nextScout)
  }

  const adoptDuplicate = (entry: { listId: string; scope: AuthorListScope }) => {
    setDraftList(null)
    setDraftUri('')
    setEditingList(false)
    setEnsureError(null)
    onChange({ ...scout, listId: entry.listId })
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
        const others = feedAuthorLists.filter(
          (l) => l.listId !== working.listId && l.listId !== nextList.listId,
        )
        commitFeedList([...others, nextList], { ...scout, listId: nextList.listId })
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
    const prevId = scout.listId
    onChange({ ...scout, listId: undefined })
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
    const prevId = scout.listId
    if (prevId && isFeedAuthorList(prevId, feedAuthorLists) && prevId !== listId) {
      onFeedAuthorListsChange(feedAuthorLists.filter((l) => l.listId !== prevId))
    }
    setDraftList(null)
    setDraftUri('')
    setEditingList(false)
    onChange({ ...scout, listId })
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
  }, [hasLinkedList, scout.listId])

  if (readOnly && !scout.listId) return null

  return (
    <div className="l2-author-list-editor">
      <div className="l2-author-list-section">
        <div className="l2-author-list-section-head">
          <span className="l2-author-list-section-label">Bluesky scout list</span>
          {showSummary && !readOnly ? (
            <span className="l2-author-list-section-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={startEditList}>
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
                disabled={readOnly || ensuring}
              />
            </label>
            {ensuring ? <p className="l2-condition-hint">Resolving list…</p> : null}
            {ensureError ? <p className="field-error">{ensureError}</p> : null}
            {projectAuthorLists.length > 0 ? (
              <label>
                Or use an L1 ingestion list
                <select
                  value={isProject ? (scout.listId ?? '') : ''}
                  disabled={readOnly}
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
            {hasLinkedList && !readOnly ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingList(false)}>
                Cancel
              </button>
            ) : null}
            {duplicateUri ? (
              <p className="field-error">
                This Bluesky list is already registered as <strong>{duplicateUri.listId}</strong> (
                {scopeLabel(duplicateUri.scope)}).
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
                All list members are scouts — their likes and reposts count toward discovery
                thresholds. Same list sync as the author node.
              </p>
            )}
          </div>
        )}

        {scout.listId ? (
          <AuthorListMembersPanel
            listId={scout.listId}
            uri={summaryUri}
            cache={cacheForList(scout.listId)}
            onRefreshList={onRefreshList}
          />
        ) : null}
      </div>
    </div>
  )
}
