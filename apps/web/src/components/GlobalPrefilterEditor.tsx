import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FeedConfig, ProjectPrefilter } from '@cfb/core-types'
import { api } from '../api/client'
import {
  PREFILTER_PALETTE_IDS,
} from '../lib/prefilter-form'
import { normalizeFeedLogicPatch } from '../lib/feed-graph-exchange'
import { L2JsonEditor } from './l2/L2JsonEditor'
import { L2VisualEditor } from './l2/visual/L2VisualEditor'

type EditorMode = 'visual' | 'json'

interface Props {
  onClose: () => void
}

function prefilterToFeedDraft(prefilter: ProjectPrefilter): FeedConfig {
  return {
    feedId: '__global_prefilter__',
    projectId: '__global__',
    name: 'Global prefilter',
    enabled: true,
    published: false,
    poolScope: 'project_only',
    match: prefilter.match,
    visualLayout: prefilter.visualLayout,
  }
}

function feedDraftToPrefilter(feed: FeedConfig): ProjectPrefilter {
  return {
    match: feed.match,
    visualLayout: feed.visualLayout,
  }
}

export function GlobalPrefilterEditor({ onClose }: Props) {
  const [mode, setMode] = useState<EditorMode>('visual')
  const [savedPrefilter, setSavedPrefilter] = useState<ProjectPrefilter | null>(null)
  const [editorDraft, setEditorDraft] = useState<FeedConfig | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.getGlobalPrefilter()
      .then(({ prefilter }) => {
        setSavedPrefilter(prefilter)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const baseDraft = useMemo(
    () => (savedPrefilter ? prefilterToFeedDraft(savedPrefilter) : null),
    [savedPrefilter],
  )

  const activeDraft = editorDraft ?? baseDraft

  const syncDraft = useCallback(
    (nextFeed: FeedConfig) => {
      setEditorDraft(nextFeed)
      setDirty(true)
    },
    [],
  )

  const handleReset = () => {
    setEditorDraft(null)
    setDirty(false)
  }

  const handleSave = async () => {
    if (!activeDraft) return
    setSaving(true)
    setError(null)
    try {
      const prefilter = feedDraftToPrefilter(activeDraft)
      const { prefilter: saved } = await api.saveGlobalPrefilter(prefilter)
      setSavedPrefilter(saved)
      setEditorDraft(null)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="workspace-page"><p className="card-hint">Loading global prefilter…</p></div>
  }

  if (!activeDraft) {
    return (
      <div className="workspace-page">
        {error && <p className="field-error">{error}</p>}
        <p className="card-hint">Failed to load global prefilter.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Back</button>
      </div>
    )
  }

  if (mode === 'visual') {
    return (
      <L2VisualEditor
        draft={activeDraft}
        dirty={dirty}
        onDraftChange={(next) => {
          const resolved = typeof next === 'function' ? next(activeDraft) : next
          syncDraft(resolved)
        }}
        onSaveDraft={() => void handleSave()}
        onReset={handleReset}
        onClose={onClose}
        onOpenJson={() => setMode('json')}
        editorTitle="Global prefilter"
        editorSubtitle="Deployment-wide — rejects posts before any project rules"
        closeLabel="Back to settings"
        canvasHint="Posts that fail this filter are dropped at the door. No project can override. Separate paths = OR, chained = AND."
        saveLabel={saving ? 'Saving…' : 'Save global prefilter'}
        prefilterMode
        paletteItemFilter={(item) => PREFILTER_PALETTE_IDS.has(item.id)}
      />
    )
  }

  return (
    <L2JsonEditor
      draft={activeDraft}
      onClose={onClose}
      onOpenVisual={() => setMode('visual')}
      onAutosaveDraft={async (patch) => {
        syncDraft({
          ...activeDraft,
          ...normalizeFeedLogicPatch(patch),
        })
      }}
    />
  )
}
