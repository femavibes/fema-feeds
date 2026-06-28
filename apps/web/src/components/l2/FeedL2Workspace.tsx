import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'

import type { ListCacheEntry } from '../../api/client'

import type { FeedWorkspaceView } from '../../lib/workspace-views'
import { FeedEditorHome } from './FeedEditorHome'
import { FeedLogicBlockUpgradesPanel } from './FeedLogicBlockUpgradesPanel'
import { FeedSortingView } from './FeedSortingView'
import { L2JsonEditor } from './L2JsonEditor'
import { L2VisualEditor } from './visual/L2VisualEditor'
import { normalizeFeedLogicPatch, type FeedLogicPatch } from '../../lib/feed-graph-exchange'
import { normalizeRuleGroup } from '@cfb/l2-graph'

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 2000

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
  hasUnpublishedDraft: boolean
  onSettingsChange: (next: FeedConfig) => void
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
  onUpdateLive?: () => Promise<void>
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
  hasUnpublishedDraft,
  onSettingsChange,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onSaveSettings,
  onNavigatorReady,
  onFeedUpgradeApplied,
  onRefreshList,
  onUpdateLive,
}: Props) {
  const [editorDraft, setEditorDraft] = useState<FeedConfig | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)
  const [jsonUnsaved, setJsonUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle')

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jsonFlushRef = useRef<(() => Promise<boolean>) | null>(null)
  const savingRef = useRef(false)
  const viewRef = useRef(view)

  viewRef.current = view

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

  const prepareEditor = useCallback(() => {
    setEditorDraft(
      structuredClone({
        ...draft,
        match: normalizeRuleGroup(draft.match),
      }),
    )
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
    <div className={`feed-builder-main${isEditorView ? ' feed-builder-main-editor' : ''}`}>
      {!isEditorView ? (
        <FeedLogicBlockUpgradesPanel
          feedId={draft.feedId}
          onUpgraded={(result) => onFeedUpgradeApplied?.(result)}
          onNotify={onNotify}
        />
      ) : null}

      {view === 'overview' && <FeedEditorHome draft={draft} />}

      {view === 'sorting' && (
        <FeedSortingView
          draft={draft}
          onChange={onSettingsChange}
          settingsDirty={settingsDirty}
          settingsAutosaveState={settingsAutosaveState}
          settingsSaving={settingsSaving}
          onSaveSettings={onSaveSettings}
        />
      )}

      {view === 'visual' && editorDraft && (
        <L2VisualEditor
          draft={editorDraft}
          dirty={editorDirty}
          saving={saving}
          autosaveState={autosaveState}
          hideSaveDraft
          revertToLive={revertToLive}
          onUpdateLive={onUpdateLive}
          onDraftChange={handleEditorDraftChange}
          onSaveDraft={handleSaveDraft}
          onReset={handleReset}
          onClose={handleCloseEditor}
          onOpenJson={() => switchEditor('json')}
          projectAuthorLists={project.authorLists ?? []}
          listCache={listCache.filter((l) => l.projectId === project.projectId)}
          onRefreshList={onRefreshList}
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
