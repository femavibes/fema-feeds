import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FeedConfig, L2Expr, SortPackEditorMode, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import {
  buildPersonalizationEditorProfile,
  packToSortDraft,
  profileFromRank,
  resolveSortPackEditorMode,
  usesSimpleSortEditor,
} from '../../lib/sort-pack-editor-profile'
import { LogicBlockMetadataFields } from '../logic-blocks/LogicBlockMetadataFields'
import { FeedSortingPanel } from '../l2/FeedSortingPanel'
import { SortFormulaBuilder } from '../l2/SortFormulaBuilder'
import {
  PERSONALIZATION_FORMULA_FIELD_LEGEND,
  SORT_FORMULA_FIELD_LEGEND,
} from '../l2/formula-field-legend-data'
import {
  PERSONALIZATION_FIELD_GROUPS,
  PERSONALIZATION_SNIPPETS,
  PERSONALIZATION_TEMPLATES,
} from '../l2/feed-personalization-presets'

interface Props {
  pkg: SortPackPackage
  onClose: () => void
  onSaved: (pkg: SortPackPackage) => void
}

export function SortFormulaEditor({ pkg, onClose, onSaved }: Props) {
  const isPersonalization = (pkg.packKind ?? 'sort') === 'personalization'
  const savedMode = useMemo(() => resolveSortPackEditorMode(pkg), [pkg])
  const [editorMode, setEditorMode] = useState<SortPackEditorMode>(savedMode)

  const [sortDraft, setSortDraft] = useState<FeedConfig>(() => packToSortDraft(pkg))
  const [expr, setExpr] = useState<L2Expr>(pkg.sortKey)
  const [baseline, setBaseline] = useState<L2Expr>(pkg.sortKey)
  const [baselineProfile, setBaselineProfile] = useState(pkg.editorProfile)
  const [name, setName] = useState(pkg.name)
  const [slug, setSlug] = useState(pkg.slug)
  const [formulaDirty, setFormulaDirty] = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSortDraft(packToSortDraft(pkg))
    setExpr(pkg.sortKey)
    setBaseline(pkg.sortKey)
    setBaselineProfile(pkg.editorProfile)
    setName(pkg.name)
    setSlug(pkg.slug)
    setEditorMode(resolveSortPackEditorMode(pkg))
    setFormulaDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [pkg.id, pkg.version, pkg.updatedAt, pkg.name, pkg.slug, pkg.sortKey, pkg.editorProfile])

  const simpleSort = !isPersonalization && usesSimpleSortEditor(editorMode)
  const dirty = formulaDirty || metaDirty

  const onReset = useCallback(() => {
    setSortDraft(packToSortDraft(pkg))
    setExpr(structuredClone(baseline))
    setEditorMode(resolveSortPackEditorMode({ ...pkg, sortKey: baseline, editorProfile: baselineProfile }))
    setName(pkg.name)
    setSlug(pkg.slug)
    setFormulaDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [baseline, baselineProfile, pkg])

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const nextSortKey = simpleSort ? sortDraft.rank?.sortKey : expr
    if (!nextSortKey) {
      setError('Formula is required')
      return
    }
    const nextProfile = simpleSort
      ? profileFromRank(sortDraft.rank)
      : isPersonalization
        ? buildPersonalizationEditorProfile()
        : { mode: 'builder' as const }
    setSaving(true)
    setError(null)
    try {
      const res = await api.updateSortPack(pkg.id, {
        name: name.trim(),
        slug: slug.trim() || name.trim(),
        sortKey: formulaDirty || simpleSort ? nextSortKey : undefined,
        editorProfile: formulaDirty || simpleSort ? nextProfile ?? null : undefined,
        bumpVersion: formulaDirty || simpleSort,
      })
      setBaseline(res.package.sortKey)
      setBaselineProfile(res.package.editorProfile)
      setExpr(res.package.sortKey)
      setSortDraft(packToSortDraft(res.package))
      setEditorMode(resolveSortPackEditorMode(res.package))
      setName(res.package.name)
      setSlug(res.package.slug)
      setFormulaDirty(false)
      setMetaDirty(false)
      onSaved(res.package)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [expr, formulaDirty, name, onSaved, pkg.id, simpleSort, slug, sortDraft.rank])

  const modeLabel =
    editorMode === 'engagement'
      ? 'Engagement'
      : editorMode === 'advanced'
        ? 'Advanced scoring'
        : editorMode === 'formula'
          ? 'Formula'
          : 'Formula builder'

  return (
    <div className="modal-backdrop sort-formula-editor-backdrop" onClick={onClose}>
      <div
        className="sort-formula-editor sort-formula-editor-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sort-formula-editor-title"
      >
        <header className="sort-formula-editor-head">
          <div>
            <h2 id="sort-formula-editor-title">
              Edit {isPersonalization ? 'personalization formula' : 'sorting formula'}
            </h2>
            <p className="card-hint">
              {pkg.name} · v{pkg.version} · {modeLabel}
              {formulaDirty ? ' · unsaved formula changes' : ''}
            </p>
          </div>
          <div className="sort-formula-editor-actions">
            {!isPersonalization && savedMode !== 'builder' && editorMode === 'builder' ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditorMode(savedMode)
                  setSortDraft(packToSortDraft({ ...pkg, sortKey: expr, editorProfile: baselineProfile }))
                  setFormulaDirty(true)
                }}
              >
                Back to {savedMode === 'engagement' ? 'Engagement' : 'Advanced'}
              </button>
            ) : null}
            {!isPersonalization && usesSimpleSortEditor(editorMode) ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditorMode('builder')
                  setExpr(sortDraft.rank?.sortKey ?? expr)
                }}
              >
                Edit as formula
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving || !dirty} onClick={onReset}>
              Reset
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={() => void onSave()}>
              {saving ? 'Saving…' : formulaDirty ? 'Save & bump version' : 'Save details'}
            </button>
          </div>
        </header>

        <div className="sort-formula-editor-meta">
          <LogicBlockMetadataFields
            name={name}
            slug={slug}
            description=""
            showDescription={false}
            disabled={saving}
            onNameChange={(v) => {
              setName(v)
              setMetaDirty(true)
            }}
            onSlugChange={(v) => {
              setSlug(v)
              setMetaDirty(true)
            }}
            onDescriptionChange={() => {}}
          />
        </div>

        {error ? <p className="field-error sort-formula-editor-error">{error}</p> : null}

        <div className="sort-formula-editor-body">
          {simpleSort ? (
            <FeedSortingPanel
              draft={sortDraft}
              onChange={(next) => {
                setSortDraft(typeof next === 'function' ? next(sortDraft) : next)
                setFormulaDirty(true)
                setError(null)
              }}
              layout="main"
              initialMode={editorMode === 'engagement' || editorMode === 'advanced' ? editorMode : undefined}
            />
          ) : (
            <SortFormulaBuilder
              draft={{ rank: { sortKey: expr } }}
              initialExpr={expr}
              onChange={(next) => {
                setExpr(next)
                setFormulaDirty(true)
                setError(null)
              }}
              fields={isPersonalization ? PERSONALIZATION_FIELDS : undefined}
              fieldGroups={isPersonalization ? PERSONALIZATION_FIELD_GROUPS : undefined}
              templates={isPersonalization ? PERSONALIZATION_TEMPLATES : undefined}
              snippets={isPersonalization ? PERSONALIZATION_SNIPPETS : undefined}
              fieldLegend={isPersonalization ? PERSONALIZATION_FORMULA_FIELD_LEGEND : SORT_FORMULA_FIELD_LEGEND}
              fieldLegendToggleLabel={isPersonalization ? 'Viewer fields' : 'Signal reference'}
              placeholder={
                isPersonalization
                  ? 'base_score * if(is_followed > 0, 1.3, 1) + feed_affinity * 10'
                  : 'likes + reposts * 2 + replies'
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}
