import { useCallback, useEffect, useState } from 'react'
import type { FeedConfig, LogicBlockPackage } from '@cfb/core-types'

import { normalizeRuleGroup } from '@cfb/l2-graph'
import { api } from '../../api/client'
import { LogicBlockMetadataFields } from './LogicBlockMetadataFields'
import { L2VisualEditor } from '../l2/visual/L2VisualEditor'

function packageToDraft(pkg: LogicBlockPackage): FeedConfig {
  return {
    feedId: `logic-block-${pkg.id}`,
    projectId: 'collection',
    name: pkg.name,
    enabled: false,
    poolScope: 'project_only',
    match: normalizeRuleGroup(structuredClone(pkg.root)),
  }
}

interface Props {
  pkg: LogicBlockPackage
  onClose: () => void
  onSaved: (pkg: LogicBlockPackage) => void
}

export function LogicBlockVisualEditor({ pkg, onClose, onSaved }: Props) {
  const [baseline, setBaseline] = useState(() => packageToDraft(pkg))
  const [draft, setDraft] = useState(() => packageToDraft(pkg))
  const [name, setName] = useState(pkg.name)
  const [slug, setSlug] = useState(pkg.slug)
  const [description, setDescription] = useState(pkg.description ?? '')
  const [logicDirty, setLogicDirty] = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = logicDirty || metaDirty

  useEffect(() => {
    const next = packageToDraft(pkg)
    setBaseline(next)
    setDraft(next)
    setName(pkg.name)
    setSlug(pkg.slug)
    setDescription(pkg.description ?? '')
    setLogicDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [pkg.id, pkg.version, pkg.updatedAt, pkg.name, pkg.slug, pkg.description])

  const onDraftChange = useCallback((next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => {
    setDraft((prev) => (typeof next === 'function' ? next(prev) : next))
    setLogicDirty(true)
    setError(null)
  }, [])

  const onReset = useCallback(() => {
    setDraft(structuredClone(baseline))
    setName(pkg.name)
    setSlug(pkg.slug)
    setDescription(pkg.description ?? '')
    setLogicDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [baseline, pkg.description, pkg.name, pkg.slug])

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.updateLogicBlock(pkg.id, {
        name: name.trim(),
        slug: slug.trim() || name.trim(),
        description: description.trim() || null,
        root: logicDirty ? draft.match : undefined,
        bumpVersion: logicDirty,
      })
      const next = packageToDraft(res.package)
      setBaseline(next)
      setDraft(next)
      setName(res.package.name)
      setSlug(res.package.slug)
      setDescription(res.package.description ?? '')
      setLogicDirty(false)
      setMetaDirty(false)
      onSaved(res.package)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [description, draft.match, logicDirty, name, onSaved, pkg.id, slug])

  return (
    <>
      {error ? (
        <div className="logic-block-editor-error" role="alert">
          {error}
        </div>
      ) : null}
      <L2VisualEditor
        draft={{ ...draft, name }}
        dirty={dirty}
        saving={saving}
        onDraftChange={onDraftChange}
        onSaveDraft={() => void onSave()}
        onReset={onReset}
        onClose={onClose}
        editorTitle={name.trim() || 'Untitled logic'}
        editorSubtitle={`Logic block · v${pkg.version}${logicDirty ? ' · logic changed' : metaDirty ? ' · details changed' : ''}`}
        saveLabel={logicDirty ? 'Save new version' : 'Save details'}
        closeLabel="Back to collection"
        hideJsonButton
        canvasHint="Build reusable match logic. Paths from START are OR; chain nodes on one path for AND. Logic changes bump the version; name-only saves do not."
        metadataPanel={
          <LogicBlockMetadataFields
            name={name}
            slug={slug}
            description={description}
            disabled={saving}
            onNameChange={(v) => {
              setName(v)
              setMetaDirty(true)
              setError(null)
            }}
            onSlugChange={(v) => {
              setSlug(v)
              setMetaDirty(true)
              setError(null)
            }}
            onDescriptionChange={(v) => {
              setDescription(v)
              setMetaDirty(true)
              setError(null)
            }}
          />
        }
      />
    </>
  )
}
