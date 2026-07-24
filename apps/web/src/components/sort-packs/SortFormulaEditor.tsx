import { useCallback, useEffect, useState } from 'react'
import type { L2Expr, SortPackPackage } from '@cfb/core-types'

import { api } from '../../api/client'
import { PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { LogicBlockMetadataFields } from '../logic-blocks/LogicBlockMetadataFields'
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
  const [expr, setExpr] = useState<L2Expr>(pkg.sortKey)
  const [baseline, setBaseline] = useState<L2Expr>(pkg.sortKey)
  const [name, setName] = useState(pkg.name)
  const [slug, setSlug] = useState(pkg.slug)
  const [formulaDirty, setFormulaDirty] = useState(false)
  const [metaDirty, setMetaDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setExpr(pkg.sortKey)
    setBaseline(pkg.sortKey)
    setName(pkg.name)
    setSlug(pkg.slug)
    setFormulaDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [pkg.id, pkg.version, pkg.updatedAt, pkg.name, pkg.slug, pkg.sortKey])

  const dirty = formulaDirty || metaDirty

  const onReset = useCallback(() => {
    setExpr(structuredClone(baseline))
    setName(pkg.name)
    setSlug(pkg.slug)
    setFormulaDirty(false)
    setMetaDirty(false)
    setError(null)
  }, [baseline, pkg.name, pkg.slug])

  const onSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.updateSortPack(pkg.id, {
        name: name.trim(),
        slug: slug.trim() || name.trim(),
        sortKey: formulaDirty ? expr : undefined,
        bumpVersion: formulaDirty,
      })
      setBaseline(res.package.sortKey)
      setExpr(res.package.sortKey)
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
  }, [expr, formulaDirty, name, onSaved, pkg.id, slug])

  return (
    <div className="logic-block-visual-editor sort-formula-editor">
      <header className="logic-block-visual-editor-head">
        <div>
          <h2>Edit {isPersonalization ? 'personalization formula' : 'sorting formula'}</h2>
          <p className="card-hint">
            {pkg.name} · v{pkg.version}
            {formulaDirty ? ' · unsaved formula changes' : ''}
          </p>
        </div>
        <div className="logic-block-visual-editor-actions">
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

      <div className="logic-block-visual-editor-meta">
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

      {error ? <p className="field-error">{error}</p> : null}

      <div className="sort-formula-editor-body">
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
      </div>
    </div>
  )
}
