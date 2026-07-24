import { useCallback, useEffect, useRef, useState } from 'react'

import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'

import { api, type ListCacheEntry } from '../api/client'
import { ConfirmModal } from './ConfirmModal'

import { persistFeedDraft, prepareFeedDraftPayload } from '../lib/feed-draft'
import type { FeedWorkspaceView, IngestionWorkspaceView } from '../lib/workspace-views'
import { readWorkspaceSession, writeWorkspaceSession } from '../lib/workspace-session'

import { ProjectIngestionWorkspace, ingestionNavItemsForMode } from './ProjectIngestionWorkspace'
import { ProjectRightSidebar } from './ProjectRightSidebar'
import { WorkspaceNav, WorkspaceNavShell } from './WorkspaceNav'

import { FeedL2Workspace } from './l2/FeedL2Workspace'
import { FeedRightSidebar, FeedRightSidebarShell } from './l2/FeedRightSidebar'
import { MobileRail } from './MobileRail'

type FeedListItem = FeedConfig & { hasUnpublishedDraft?: boolean }
type SettingsAutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const SETTINGS_AUTOSAVE_MS = 2000
/** Poll live Param values while in the visual editor (triggers / API write live). */
const LIVE_PARAM_POLL_MS = 15_000

interface Props {
  draft: ProjectL1Config
  projectDirty: boolean
  feeds: FeedListItem[]
  feedId: string | null
  onFeedsChange: (feeds: FeedListItem[]) => void
  onFeedIdChange: (feedId: string | null) => void
  onProjectChange: (next: ProjectL1Config) => void
  /** Sync compiled ingest gate after feed Update live (also updates saved baseline when not dirty). */
  onProjectCompiled?: (project: ProjectL1Config) => void
  listCache: ListCacheEntry[]
  onRefreshList: (listId: string) => Promise<void>
  onListsChanged?: () => void | Promise<void>
  saving: boolean
  onSaveProject: () => void
  onDeleteProject: () => void
  onNotify: (message: string | null, error: string | null) => void
  onOpenPublishingSettings?: () => void
  onCloneFeed?: (feed: FeedConfig) => void
}

export function ProjectWorkspace({
  draft,
  projectDirty,
  feeds,
  feedId,
  onFeedsChange,
  onFeedIdChange,
  onProjectChange,
  onProjectCompiled,
  listCache,
  onRefreshList,
  onListsChanged,
  saving,
  onSaveProject,
  onDeleteProject,
  onNotify,
  onOpenPublishingSettings,
  onCloneFeed,
}: Props) {
  const [feedDraft, setFeedDraft] = useState<FeedConfig | null>(null)
  const [liveFeed, setLiveFeed] = useState<FeedConfig | null>(null)
  const [hasUnpublishedDraft, setHasUnpublishedDraft] = useState(false)
  const [feedBusy, setFeedBusy] = useState(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [applySettingsBusy, setApplySettingsBusy] = useState(false)
  const [settingsAutosaveState, setSettingsAutosaveState] =
    useState<SettingsAutosaveState>('idle')
  const [ingestionView, setIngestionView] = useState<IngestionWorkspaceView>('overview')
  const [feedView, setFeedView] = useState<FeedWorkspaceView>(() => {
    const session = readWorkspaceSession()
    if (session?.feedId && session.feedId === feedId) return session.feedView
    return 'overview'
  })
  const [confirmDeleteFeed, setConfirmDeleteFeed] = useState(false)

  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedDraftRef = useRef<FeedConfig | null>(null)
  feedDraftRef.current = feedDraft
  const feedNavigateRef = useRef<((view: FeedWorkspaceView) => Promise<boolean>) | null>(null)
  const prevFeedIdRef = useRef<string | null>(feedId)
  const loadingFeedMeta = feedId ? feeds.find((f) => f.feedId === feedId) : null

  const clearSettingsAutosave = () => {
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current)
      settingsTimerRef.current = null
    }
  }

  const loadFeedEditor = (id: string) => {
    void api.getFeed(id).then(
      (res) => {
        setFeedDraft(structuredClone(res.feed))
        setLiveFeed(res.live)
        setHasUnpublishedDraft(res.hasUnpublishedDraft)
      },
      () => {
        setFeedDraft(null)
        setLiveFeed(null)
        setHasUnpublishedDraft(false)
      },
    )
  }

  useEffect(() => {
    if (!feedId) {
      setFeedDraft(null)
      setLiveFeed(null)
      setHasUnpublishedDraft(false)
      setSettingsDirty(false)
      setSettingsAutosaveState('idle')
      setFeedView('overview')
      clearSettingsAutosave()
      prevFeedIdRef.current = null
      return
    }
    const switchedFeed = prevFeedIdRef.current != null && prevFeedIdRef.current !== feedId
    prevFeedIdRef.current = feedId
    setSettingsDirty(false)
    setSettingsAutosaveState('idle')
    clearSettingsAutosave()
    // Reload / remount of the same feed keeps the session view (e.g. visual editor).
    // Switching to a different feed starts on overview.
    if (switchedFeed) setFeedView('overview')
    loadFeedEditor(feedId)
  }, [feedId])

  useEffect(() => {
    writeWorkspaceSession({ feedId: feedId ?? null, feedView })
  }, [feedId, feedView])

  useEffect(() => {
    if (!feedId || feedView !== 'visual') return
    const pollLive = () => {
      void api.getFeed(feedId).then(
        (res) => setLiveFeed(structuredClone(res.live)),
        () => undefined,
      )
    }
    pollLive()
    const timer = setInterval(pollLive, LIVE_PARAM_POLL_MS)
    return () => clearInterval(timer)
  }, [feedId, feedView])

  useEffect(() => {
    setIngestionView('overview')
  }, [draft.projectId])

  useEffect(() => () => clearSettingsAutosave(), [])

  const onLiveUpdated = (
    live: FeedConfig,
    draftPending: boolean,
    compiledProject?: ProjectL1Config,
  ) => {
    setLiveFeed(live)
    setHasUnpublishedDraft(draftPending)
    onFeedsChange(
      feeds.map((f) =>
        f.feedId === live.feedId ? { ...f, ...live, hasUnpublishedDraft: draftPending } : f,
      ),
    )
    if (compiledProject?.projectId === draft.projectId) {
      onProjectCompiled?.(compiledProject)
    }
  }

  const saveFeedDraft = useCallback(
    async (feed: FeedConfig): Promise<FeedConfig> => {
      const res = await persistFeedDraft(feed)
      setFeedDraft(structuredClone(res.feed))
      onLiveUpdated(res.live, res.hasUnpublishedDraft)
      return res.feed
    },
    [feeds, onFeedsChange],
  )

  const commitSettingsSave = useCallback(
    async (next: FeedConfig, options?: { silent?: boolean }) => {
      setSettingsSaving(true)
      if (options?.silent) setSettingsAutosaveState('saving')
      try {
        await saveFeedDraft(next)
        setSettingsDirty(false)
        if (options?.silent) {
          setSettingsAutosaveState('saved')
          window.setTimeout(() => setSettingsAutosaveState('idle'), 2400)
        } else {
          onNotify('Settings saved to draft', null)
          setSettingsAutosaveState('idle')
        }
      } catch (e) {
        if (options?.silent) {
          setSettingsAutosaveState('error')
        } else {
          onNotify(null, e instanceof Error ? e.message : 'Save settings failed')
        }
        throw e
      } finally {
        setSettingsSaving(false)
      }
    },
    [onNotify, saveFeedDraft],
  )

  useEffect(() => {
    if (!settingsDirty || !feedDraft) return
    clearSettingsAutosave()
    setSettingsAutosaveState('pending')
    settingsTimerRef.current = setTimeout(() => {
      settingsTimerRef.current = null
      const snap = feedDraftRef.current
      if (!snap) return
      void commitSettingsSave(snap, { silent: true }).catch(() => undefined)
    }, SETTINGS_AUTOSAVE_MS)
  }, [commitSettingsSave, feedDraft, settingsDirty])

  const handleSettingsChange = (
    next: FeedConfig | ((prev: FeedConfig) => FeedConfig),
  ) => {
    setFeedDraft((prev) => {
      if (!prev) return prev
      return typeof next === 'function' ? next(prev) : next
    })
    setSettingsDirty(true)
  }

  const flushSettingsSave = useCallback(async (): Promise<FeedConfig | null> => {
    const snap = feedDraftRef.current
    if (!snap || !settingsDirty) return snap
    clearSettingsAutosave()
    await commitSettingsSave(snap, { silent: true })
    return feedDraftRef.current ?? snap
  }, [commitSettingsSave, settingsDirty])

  const handleSaveSettings = () => {
    const snap = feedDraftRef.current
    if (!snap || settingsSaving) return
    clearSettingsAutosave()
    void commitSettingsSave(snap)
  }

  const handleFeedViewChange = (view: FeedWorkspaceView) => {
    void (async () => {
      try {
        await flushSettingsSave()
      } catch {
        /* user can retry Save now on the settings tab */
      }
      const nav = feedNavigateRef.current
      if (nav) {
        const ok = await nav(view)
        if (ok) setFeedView(view)
      } else {
        setFeedView(view)
      }
    })()
  }

  const handleUpdateLive = useCallback(async (feed?: FeedConfig) => {
    const source = feed ?? feedDraft
    if (!source) return
    onNotify(null, null)
    try {
      const res = await api.updateFeed(prepareFeedDraftPayload(source))
      setFeedDraft(structuredClone(res.feed))
      onLiveUpdated(res.live, res.hasUnpublishedDraft, res.project)
      onNotify('Live rules updated — rebuilding candidates…', null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Update failed')
    }
  }, [feedDraft, onNotify, onLiveUpdated])

  const handleApplyFeedSettings = useCallback(async (feed: FeedConfig) => {
    setApplySettingsBusy(true)
    onNotify(null, null)
    try {
      const res = await api.applyFeedSettings(prepareFeedDraftPayload(feed))
      setFeedDraft(structuredClone(res.feed))
      onLiveUpdated(res.live, res.hasUnpublishedDraft)
      setSettingsDirty(false)
      onNotify(
        res.rankRescoreStarted
          ? 'Applied to this feed — rescoring existing candidates in the background.'
          : 'Applied to this feed.',
        null,
      )
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Apply failed')
      throw e
    } finally {
      setApplySettingsBusy(false)
    }
  }, [onNotify, onLiveUpdated])

  const livePayloadResolverRef = useRef<(() => Promise<FeedConfig>) | null>(null)
  const registerLivePayloadResolver = useCallback((resolve: (() => Promise<FeedConfig>) | null) => {
    livePayloadResolverRef.current = resolve
  }, [])

  const resolveFeedForSidebarLiveUpdate = useCallback(async () => {
    const snap = await flushSettingsSave()
    if (!snap) throw new Error('No feed draft loaded')
    const useEditorPayload =
      (feedView === 'visual' || feedView === 'json') && livePayloadResolverRef.current
    if (useEditorPayload) {
      return livePayloadResolverRef.current!()
    }
    return snap
  }, [feedView, flushSettingsSave])

  const confirmAndDeleteFeed = async () => {
    if (!feedDraft) return
    setConfirmDeleteFeed(false)
    onNotify(null, null)
    try {
      // Auto-unpublish from Bluesky if published
      if (feedDraft.published || liveFeed?.published) {
        await api.unpublishFeed(feedDraft.feedId).catch(() => null)
      }
      await api.deleteFeed(feedDraft.feedId)
      const remaining = feeds.filter((f) => f.feedId !== feedDraft.feedId)
      onFeedsChange(remaining)
      onFeedIdChange(null)
      onNotify(`Deleted feed ${feedDraft.name}`, null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Delete feed failed')
    }
  }

  const downloadFeedBackup = () => {
    if (!feedDraft) return
    const { published, publishedAt, publishedUri, ownerDid, liveAt, ...backup } = feedDraft as any
    const wrapped = { version: 1, format: 'cfb-feed-backup', exportedAt: new Date().toISOString(), ...backup }
    const json = JSON.stringify(wrapped, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${feedDraft.feedId}.feed-backup.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadFeedLogic = () => {
    if (!feedDraft) return
    const logic: Record<string, unknown> = {
      version: 1,
      format: 'cfb-feed-graph',
      exportedAt: new Date().toISOString(),
      match: feedDraft.match,
    }
    if (feedDraft.visualLayout) logic.visualLayout = feedDraft.visualLayout
    if (feedDraft.rank) logic.rank = feedDraft.rank
    if (feedDraft.injector) logic.injector = feedDraft.injector
    if (feedDraft.sources) logic.sources = feedDraft.sources
    if (feedDraft.personalization) logic.personalization = feedDraft.personalization
    const json = JSON.stringify(logic, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${feedDraft.feedId}.feed-logic.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const workspaceMode = feedId ? 'feed' : 'ingestion'
  const workspaceLabel = feedId
    ? loadingFeedMeta?.name ?? feedId
    : draft.name

  return (
    <div className="project-workspace">
      {feedId && !feedDraft ? (
        <WorkspaceNavShell mode="feed" contextLabel={workspaceLabel} />
      ) : (
        <WorkspaceNav
          mode={workspaceMode}
          contextLabel={workspaceLabel}
          feedView={feedView}
          ingestionView={ingestionView}
          ingestionNavItems={ingestionNavItemsForMode(draft?.prefilterMode ?? 'strict')}
          onFeedViewChange={handleFeedViewChange}
          onIngestionViewChange={setIngestionView}
        />
      )}

      <main className="l2-main-panel">
        {feedId ? (
          feedDraft ? (
            <FeedL2Workspace
              draft={feedDraft}
              project={draft}
              listCache={listCache}
              view={feedView}
              onViewChange={setFeedView}
              onChange={setFeedDraft}
              onSaveDraft={saveFeedDraft}
              onNotify={onNotify}
              liveFeed={liveFeed}
              onLiveFeedChange={(next) => setLiveFeed(structuredClone(next))}
              hasUnpublishedDraft={hasUnpublishedDraft}
              onSettingsChange={handleSettingsChange}
              settingsDirty={settingsDirty}
              settingsAutosaveState={settingsAutosaveState}
              settingsSaving={settingsSaving}
              onSaveSettings={handleSaveSettings}
              onNavigatorReady={(nav) => {
                feedNavigateRef.current = nav
              }}
              onFeedUpgradeApplied={(result) => {
                setFeedDraft(structuredClone(result.feed))
                onLiveUpdated(result.live, result.hasUnpublishedDraft)
              }}
              onRefreshList={onRefreshList}
              onListsChanged={onListsChanged}
              onApplyFeedSettings={handleApplyFeedSettings}
              applySettingsBusy={applySettingsBusy}
              onUpdateLive={handleUpdateLive}
              onRegisterLivePayloadResolver={registerLivePayloadResolver}
              onCloneFeed={onCloneFeed && feedDraft ? () => onCloneFeed(feedDraft) : undefined}
            />
          ) : (
            <div className="empty-state">Loading feed…</div>
          )
        ) : (
          <ProjectIngestionWorkspace
            draft={draft}
            projectDirty={projectDirty}
            view={ingestionView}
            onViewChange={setIngestionView}
            onChange={onProjectChange}
            onSave={() => { onSaveProject(); return Promise.resolve() }}
            listCache={listCache}
            onRefreshList={onRefreshList}
            feeds={feeds}
          />
        )}
      </main>

      <MobileRail label="Actions">
      {feedId ? (
        feedDraft ? (
          <FeedRightSidebar
            feedDraft={feedDraft}
            liveFeed={liveFeed}
            hasUnpublishedDraft={hasUnpublishedDraft}
            busy={feedBusy}
            settingsDirty={settingsDirty}
            settingsAutosaveState={settingsAutosaveState}
            settingsSaving={settingsSaving}
            activeView={feedView}
            onBusyChange={setFeedBusy}
            onFeedChange={setFeedDraft}
            onSettingsChange={handleSettingsChange}
            onSaveSettings={handleSaveSettings}
            onLiveUpdated={onLiveUpdated}
            onNotify={onNotify}
            resolveFeedForLiveUpdate={resolveFeedForSidebarLiveUpdate}
            onOpenPublishingSettings={onOpenPublishingSettings}
            onPublishStateChange={(published) => {
              if (!liveFeed) return
              const next = { ...liveFeed, published }
              setLiveFeed(next)
              onFeedsChange(
                feeds.map((f) => (f.feedId === next.feedId ? { ...f, published } : f)),
              )
            }}
            onDeleteFeed={() => setConfirmDeleteFeed(true)}
          />
        ) : (
          <FeedRightSidebarShell feedName={loadingFeedMeta?.name} feedId={feedId} />
        )
      ) : (
        <ProjectRightSidebar
          draft={draft}
          saving={saving}
          projectDirty={projectDirty}
          onSaveProject={onSaveProject}
          onDeleteProject={onDeleteProject}
        />
      )}
      </MobileRail>

      {confirmDeleteFeed && feedDraft && (
        <ConfirmModal
          title="Delete feed"
          message={
            <>
              <p>Delete feed <strong>{feedDraft.name}</strong>?</p>
              <p>This removes the feed config and all its candidates. This cannot be undone.</p>
              {(feedDraft.published || liveFeed?.published) && (
                <p className="card-hint">
                  The feed will be automatically unpublished from Bluesky.
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={downloadFeedBackup}
              >
                Download backup
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={downloadFeedLogic}
              >
                Download logic only
              </button>
            </>
          }
          confirmLabel="Delete feed"
          onConfirm={() => void confirmAndDeleteFeed()}
          onCancel={() => setConfirmDeleteFeed(false)}
        />
      )}
    </div>
  )
}
