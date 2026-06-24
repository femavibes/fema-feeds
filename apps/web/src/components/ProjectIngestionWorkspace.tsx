import { useCallback, useMemo, useState } from 'react'
import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'
import type { ListCacheEntry } from '../api/client'
import type { IngestionWorkspaceView } from '../lib/workspace-views'
import {
  feedDraftToPrefilter,
  patchProjectPrefilter,
  prefilterToFeedDraft,
  PREFILTER_PALETTE_IDS,
} from '../lib/prefilter-form'
import { normalizeFeedLogicPatch } from '../lib/feed-graph-exchange'
import { IngestionOverview } from './IngestionOverview'
import { ProjectPrefilterCompiledPage } from './ProjectPrefilterCompiledPage'
import { L2JsonEditor } from './l2/L2JsonEditor'
import { L2VisualEditor } from './l2/visual/L2VisualEditor'

interface Props {
  draft: ProjectL1Config
  projectDirty: boolean
  view: IngestionWorkspaceView
  onViewChange: (view: IngestionWorkspaceView) => void
  onChange: (next: ProjectL1Config) => void
  listCache: ListCacheEntry[]
  onRefreshList: (listId: string) => Promise<void>
}

export function ProjectIngestionWorkspace({
  draft,
  projectDirty,
  view,
  onViewChange,
  onChange,
  listCache,
  onRefreshList,
}: Props) {
  const [editorDraft, setEditorDraft] = useState<FeedConfig | null>(null)
  const [editorDirty, setEditorDirty] = useState(false)

  const feedDraft = useMemo(() => prefilterToFeedDraft(draft), [draft])
  const activeDraft = editorDraft ?? feedDraft

  const syncPrefilter = useCallback(
    (nextFeed: FeedConfig) => {
      setEditorDraft(nextFeed)
      setEditorDirty(true)
      onChange(patchProjectPrefilter(draft, feedDraftToPrefilter(nextFeed)))
    },
    [draft, onChange],
  )

  const handleReset = () => {
    setEditorDraft(null)
    setEditorDirty(false)
    onChange(patchProjectPrefilter(draft, feedDraftToPrefilter(feedDraft)))
  }

  const closeEditor = () => onViewChange('overview')

  const switchEditor = (mode: 'visual' | 'json') => onViewChange(mode)

  if (view === 'overview') {
    return (
      <IngestionOverview draft={draft} projectDirty={projectDirty} onChange={onChange} />
    )
  }

  if (view === 'prefilter') {
    return <ProjectPrefilterCompiledPage draft={draft} />
  }

  if (view === 'visual') {
    return (
      <L2VisualEditor
        draft={activeDraft}
        dirty={editorDirty}
        onDraftChange={(next) => {
          const resolved = typeof next === 'function' ? next(activeDraft) : next
          syncPrefilter(resolved)
        }}
        onSaveDraft={() => undefined}
        onReset={handleReset}
        onClose={closeEditor}
        onOpenJson={() => switchEditor('json')}
        editorTitle="Project prefilter"
        editorSubtitle="Pool entry rules — always on at Jetstream"
        closeLabel="Back to overview"
        canvasHint="Separate paths from START are OR. Chain on one path (START → A → B → END) for AND. Save the project in the sidebar when you are ready to compile and persist."
        hideSaveDraft
        prefilterMode
        paletteItemFilter={(item) => PREFILTER_PALETTE_IDS.has(item.id)}
        projectAuthorLists={draft.authorLists}
        listCache={listCache}
        onRefreshList={onRefreshList}
      />
    )
  }

  if (view === 'json') {
    return (
      <L2JsonEditor
        draft={activeDraft}
        onClose={closeEditor}
        onOpenVisual={() => switchEditor('visual')}
        onAutosaveDraft={async (patch) => {
          syncPrefilter({
            ...activeDraft,
            ...normalizeFeedLogicPatch(patch),
          })
        }}
      />
    )
  }

  return null
}
