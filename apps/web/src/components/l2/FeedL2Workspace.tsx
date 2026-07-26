import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { FeedConfig, LogicBlockUpgradeHint, ProjectL1Config } from '@cfb/core-types'

import { api, type ListCacheEntry } from '../../api/client'

import type { FeedWorkspaceView } from '../../lib/workspace-views'
import { FeedEditorHome } from './FeedEditorHome'
import { FeedLogicBlockUpgradesPanel } from './FeedLogicBlockUpgradesPanel'
import { FeedSortingView } from './FeedSortingView'
import { FeedPersonalizationView } from './FeedPersonalizationView'
import { FeedInjectorsView } from './FeedInjectorsView'
import { FeedSourcesView } from './FeedSourcesView'
import { FeedIntelligencePanel } from '../FeedIntelligencePanel'
import { L2JsonEditor } from './L2JsonEditor'
import { L2VisualEditor } from './visual/L2VisualEditor'
import { LogicBlockVersionCompare } from '../logic-blocks/LogicBlockVersionCompare'
import { normalizeFeedLogicPatch, type FeedLogicPatch } from '../../lib/feed-graph-exchange'
import { normalizeRuleGroup } from '@cfb/l2-graph'

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 2000

/** Dev aid: hover tooltip on the canvas naming the component behind the active view. */
const VIEW_SOURCE_FILES: Record<FeedWorkspaceView, string> = {
  overview: 'FeedEditorHome.tsx',
  visual: 'visual/L2VisualEditor.tsx',
  json: 'L2JsonEditor.tsx',
  sorting: 'FeedSortingView.tsx',
  personalization: 'FeedPersonalizationView.tsx',
  injectors: 'FeedInjectorsView.tsx',
  sources: 'FeedSourcesView.tsx',
  intelligence: 'FeedIntelligencePanel.tsx',
}

interface Props {
  draft: FeedConfig
  project: ProjectL1Config
  listCache: ListCacheEntry[]
  view: FeedWorkspaceView
  onViewChange: (view: FeedWorkspaceView) => void
  onChange: (next: FeedConfig) => void
  onSaveDraft: (feed: FeedConfig) => Promise<FeedConfig>
  onNotify: (message: string | null, error: string | null) => void
  liveFeed: FeedConfig | null
  onLiveFeedChange?: (feed: FeedConfig) => void
  hasUnpublishedDraft: boolean
  onSettingsChange: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void
  settingsDirty: boolean
  settingsAutosaveState: AutosaveState
  settingsSaving: boolean
  onSaveSettings: () => void
  onNavigatorReady?: (navigate: (view: FeedWorkspaceView) => Promise<boolean>) => void
  onFeedUpgradeApplied?: (result: {
    feed: FeedConfig
    live: FeedConfig
    hasUnpublishedDraft: boolean
  }) => void
  onRefreshList?: (listId: string) => Promise<void>
  onListsChanged?: () => void | Promise<void>
  /** Promote draft → live. May receive a freshly flushed editor feed (preferred over parent state). */
  onApplyFeedSettings: (feed: FeedConfig) => Promise<void>
  applySettingsBusy?: boolean
  onUpdateLive?: (feed?: FeedConfig) => Promise<void>
  /** So Deploy sidebar can flush the open visual/JSON editor before Update Live. */
  onRegisterLivePayloadResolver?: (resolve: (() => Promise<FeedConfig>) | null) => void
  onCloneFeed?: () => void
}

export function FeedL2Workspace({
  draft,
  project,
  listCache,
  view,
  onViewChange,
  onChange,
  onSaveDraft,
  onNotify,
  liveFeed,
  onLiveFeedChange,
  hasUnpublishedDraft,
  onSettingsChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
  onNavigatorReady,
  onFeedUpgradeApplied,
  onRefreshList,
  onListsChanged,
  onApplyFeedSettings,
  applySettingsBusy = false,
  onUpdateLive,
  onRegisterLivePayloadResolver,
  onCloneFeed,
}: Props) {
  const [editorDraft, setEditorDraft] = useState<FeedConfig | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const [jsonUnsaved, setJsonUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')
  const [logicCompare, setLogicCompare] = useState<LogicBlockUpgradeHint | null>(null)

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jsonFlushRef = useRef<(() => Promise<boolean>) | null>(null)
  const savingRef = useRef(false)
  const viewRef = useRef(view)
  const editorDraftRef = useRef(editorDraft)
  const editorDirtyRef = useRef(editorDirty)
  const lastCommittedRef = useRef<FeedConfig>(draft)

  viewRef.current = view
  editorDraftRef.current = editorDraft
  editorDirtyRef.current = editorDirty

  const isEditorView = view === 'visual' || view === 'json'

  const clearAutosaveTimer = () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  const commitSaveDraft = useCallback(
    async (next: FeedConfig, options?: { silent?: boolean }) => {
      setSaving(true)
      savingRef.current = true
      if (!options?.silent) onNotify(null, null)
      if (options?.silent) setAutosaveState('saving')
      try {
        const saved = await onSaveDraft(next)
        lastCommittedRef.current = saved
        if (!options?.silent) setEditorDraft(structuredClone(saved))
        onChange(saved)
        setEditorDirty(false)
        setJsonUnsaved(false)
        if (options?.silent) {
          setAutosaveState('saved')
          window.setTimeout(() => setAutosaveState('idle'), 2400)
        } else {
          onNotify('Draft saved', null)
          setAutosaveState('idle')
        }
        return saved
      } catch (e) {
        if (options?.silent) {
          setAutosaveState('error')
        } else {
          onNotify(null, e instanceof Error ? e.message : 'Save draft failed')
        }
        throw e
      } finally {
        setSaving(false)
        savingRef.current = false
      }
    },
    [onChange, onNotify, onSaveDraft],
  )

  const scheduleAutosave = useCallback(
    (next: FeedConfig) => {
      clearAutosaveTimer()
      setAutosaveState('pending')
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null
        if (savingRef.current) return
        void commitSaveDraft(next, { silent: true }).catch(() => undefined)
      }, AUTOSAVE_MS)
    },
    [commitSaveDraft],
  )

  useEffect(() => () => clearAutosaveTimer(), [])

  useEffect(() => {
    if (view === 'visual' && editorDirty && editorDraft) {
      scheduleAutosave(editorDraft)
    }
  }, [editorDraft, editorDirty, view, scheduleAutosave])

  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    clearAutosaveTimer()
    if (viewRef.current === 'json' && jsonFlushRef.current) {
      return jsonFlushRef.current()
    }
    if (editorDirty && editorDraft) {
      try {
        await commitSaveDraft(editorDraft, { silent: true })
        return true
      } catch {
        return false
      }
    }
    return true
  }, [commitSaveDraft, editorDirty, editorDraft])

  /** Latest draft for Update Live — flushes visual/JSON editor so we never promote a stale parent copy. */
  const resolveFeedForLiveUpdate = useCallback(async (): Promise<FeedConfig> => {
    clearAutosaveTimer()
    if (viewRef.current === 'json' && jsonFlushRef.current) {
      const ok = await jsonFlushRef.current()
      if (!ok) throw new Error('Could not save draft before updating live')
      return lastCommittedRef.current
    }
    if (editorDirtyRef.current && editorDraftRef.current) {
      return commitSaveDraft(editorDraftRef.current, { silent: true })
    }
    return draft
  }, [commitSaveDraft, draft])

  const handleUpdateLive = useCallback(async () => {
    if (!onUpdateLive) return
    const feed = await resolveFeedForLiveUpdate()
    await onUpdateLive(feed)
  }, [onUpdateLive, resolveFeedForLiveUpdate])

  useEffect(() => {
    if (!onRegisterLivePayloadResolver) return
    onRegisterLivePayloadResolver(() => resolveFeedForLiveUpdate())
    return () => onRegisterLivePayloadResolver(null)
  }, [onRegisterLivePayloadResolver, resolveFeedForLiveUpdate])

  const prepareEditor = useCallback(() => {
    const next = structuredClone({
      ...draft,
      match: normalizeRuleGroup(draft.match),
    })
    setEditorDraft(next)
    lastCommittedRef.current = next
    setEditorDirty(false)
    setJsonUnsaved(false)
    setAutosaveState('idle')
  }, [draft])

  const navigateToView = useCallback(
    async (next: FeedWorkspaceView): Promise<boolean> => {
      if (next === viewRef.current) return true

      const crossingEditors =
        (viewRef.current === 'visual' || viewRef.current === 'json') &&
        (next === 'visual' || next === 'json') &&
        next !== viewRef.current

      const leavingEditor =
        (viewRef.current === 'visual' || viewRef.current === 'json') &&
        next !== 'visual' &&
        next !== 'json'

      if ((leavingEditor || crossingEditors) && (editorDirty || jsonUnsaved)) {
        const ok = await flushPendingSave()
        if (!ok && !window.confirm('Could not autosave your changes. Leave anyway and discard them?')) {
          return false
        }
      }

      if (next === 'visual' || next === 'json') {
        if (viewRef.current !== 'visual' && viewRef.current !== 'json') {
          prepareEditor()
        } else if (next !== viewRef.current) {
          setEditorDirty(false)
          setJsonUnsaved(false)
          setAutosaveState('idle')
        }
      } else {
        setEditorDraft(null)
        setEditorDirty(false)
        setJsonUnsaved(false)
        setAutosaveState('idle')
      }

      onViewChange(next)
      return true
    },
    [editorDirty, flushPendingSave, jsonUnsaved, onViewChange, prepareEditor],
  )

  useEffect(() => {
    onNavigatorReady?.(navigateToView)
  }, [navigateToView, onNavigatorReady])

  useEffect(() => {
    if ((view === 'visual' || view === 'json') && !editorDraft) {
      prepareEditor()
    }
  }, [view, editorDraft, prepareEditor])

  const handleEditorDraftChange = (
    next: FeedConfig | ((prev: FeedConfig) => FeedConfig),
  ) => {
    setEditorDraft((prev) => {
      if (!prev) {
        return typeof next === 'function' ? next(draft) : next
      }
      return typeof next === 'function' ? next(prev) : next
    })
    setEditorDirty(true)
  }

  const handleSaveDraft = () => {
    if (!editorDraft || saving) return
    clearAutosaveTimer()
    void commitSaveDraft(editorDraft)
  }

  const handleRevertToLive = useCallback(async () => {
    if (!liveFeed || !hasUnpublishedDraft || saving) return
    if (
      !window.confirm(
        'Discard all draft changes and restore rules from the current live version?',
      )
    ) {
      return
    }
    clearAutosaveTimer()
    setSaving(true)
    savingRef.current = true
    onNotify(null, null)
    try {
      const saved = await onSaveDraft(liveFeed)
      setEditorDraft(structuredClone(saved))
      onChange(saved)
      setEditorDirty(false)
      setJsonUnsaved(false)
      setAutosaveState('idle')
      onNotify('Reverted to live rules', null)
    } catch (e) {
      onNotify(null, e instanceof Error ? e.message : 'Revert failed')
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }, [hasUnpublishedDraft, liveFeed, onChange, onNotify, onSaveDraft, saving])

  const revertToLive = useMemo(
    () => ({
      enabled: Boolean(liveFeed && hasUnpublishedDraft),
      onRevert: () => void handleRevertToLive(),
    }),
    [handleRevertToLive, hasUnpublishedDraft, liveFeed],
  )

  const handleReset = () => {
    clearAutosaveTimer()
    setEditorDraft(structuredClone(draft))
    setEditorDirty(false)
    setJsonUnsaved(false)
    setAutosaveState('idle')
  }

  const handleCloseEditor = () => {
    void navigateToView('overview')
  }

  const switchEditor = (mode: 'visual' | 'json') => {
    void navigateToView(mode)
  }

  const handleJsonAutosave = async (patch: FeedLogicPatch) => {
    if (!editorDraft || savingRef.current) return
    const next = { ...editorDraft, ...normalizeFeedLogicPatch(patch) }
    setEditorDraft(next)
    await commitSaveDraft(next, { silent: true })
  }

  return (
    <div
      className={`feed-builder-main${isEditorView ? ' feed-builder-main-editor' : ''}`}
      title={VIEW_SOURCE_FILES[view]}
    >
      <FeedLogicBlockUpgradesPanel
        feedId={draft.feedId}
        onUpgraded={(result) => onFeedUpgradeApplied?.(result)}
        onNotify={isEditorView ? undefined : onNotify}
        onCompare={setLogicCompare}
      />

      {logicCompare ? (
        <LogicBlockVersionCompare
          packageId={logicCompare.packageId}
          fromVersion={logicCompare.pinnedVersion}
          toVersion={logicCompare.latestVersion}
          title={logicCompare.label ?? logicCompare.packageName}
          onClose={() => setLogicCompare(null)}
          onUpgrade={async () => {
            const res = await api.applyFeedLogicBlockUpgrades(draft.feedId, [logicCompare.nodeId])
            onFeedUpgradeApplied?.({
              feed: res.feed,
              live: res.live,
              hasUnpublishedDraft: res.hasUnpublishedDraft,
            })
            onNotify?.(
              `Updated ${logicCompare.packageName} to v${logicCompare.latestVersion} in feed rules`,
              null,
            )
          }}
        />
      ) : null}

      {view === 'overview' && <FeedEditorHome draft={draft} onCloneFeed={onCloneFeed} />}

      {view === 'sorting' && (
        <FeedSortingView
          draft={draft}
          liveFeed={liveFeed}
          onApplySettings={onApplyFeedSettings}
          applyBusy={applySettingsBusy}
        />
      )}

      {view === 'personalization' && (
        <FeedPersonalizationView
          draft={draft}
          liveFeed={liveFeed}
          onApplySettings={onApplyFeedSettings}
          applyBusy={applySettingsBusy}
        />
      )}

      {view === 'injectors' && (
        <FeedInjectorsView
          draft={draft}
          onChange={onSettingsChange}
          settingsDirty={settingsDirty}
          settingsAutosaveState={settingsAutosaveState}
          settingsSaving={settingsSaving}
          onSaveSettings={onSaveSettings}
        />
      )}

      {view === 'sources' && (
        <FeedSourcesView
          draft={draft}
          onChange={onSettingsChange}
          projectId={project.projectId}
          projectAuthorLists={project.authorLists ?? []}
          listCache={listCache.filter((l) => l.projectId === project.projectId)}
          onRefreshList={onRefreshList}
          onListsChanged={onListsChanged}
          settingsDirty={settingsDirty}
          settingsAutosaveState={settingsAutosaveState}
          settingsSaving={settingsSaving}
          onSaveSettings={onSaveSettings}
        />
      )}

      {view === 'intelligence' && (
        <FeedIntelligencePanel projectId={project.projectId} feedId={draft.feedId} />
      )}

      {view === 'visual' && editorDraft && (
        <L2VisualEditor
          draft={editorDraft}
          liveFeed={liveFeed}
          onLiveFeedChange={onLiveFeedChange}
          dirty={editorDirty}
          saving={saving}
          autosaveState={autosaveState}
          hideSaveDraft
          revertToLive={revertToLive}
          onUpdateLive={onUpdateLive ? handleUpdateLive : undefined}
          onDraftChange={handleEditorDraftChange}
          onSaveDraft={handleSaveDraft}
          onReset={handleReset}
          onClose={handleCloseEditor}
          onOpenJson={() => switchEditor('json')}
          projectAuthorLists={project.authorLists ?? []}
          listCache={listCache.filter((l) => l.projectId === project.projectId)}
          onRefreshList={onRefreshList}
          onListsChanged={onListsChanged}
        />
      )}

      {view === 'json' && editorDraft && (
        <L2JsonEditor
          draft={editorDraft}
          saving={saving}
          autosaveState={autosaveState}
          onAutosaveDraft={handleJsonAutosave}
          revertToLive={revertToLive}
          onRegisterFlush={(fn) => {
            jsonFlushRef.current = fn
          }}
          onUnsavedChange={setJsonUnsaved}
          onClose={handleCloseEditor}
          onOpenVisual={() => switchEditor('visual')}
        />
      )}
    </div>
  )
}
