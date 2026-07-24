import { useEffect, useState } from 'react'
import type { L2Expr } from '@cfb/core-types'

import { api } from '../../api/client'
import { exprToFormula, FORMULA_FIELDS, PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { FeedFormulaPreviewPanel } from '../l2/FeedFormulaPreviewPanel'

interface Props {
  packageId: string
  fromVersion: string
  toVersion: string
  title: string
  variant: 'sort' | 'personalization'
  onClose: () => void
}

export function SortPackVersionCompare({
  packageId,
  fromVersion,
  toVersion,
  title,
  variant,
  onClose,
}: Props) {
  const [fromExpr, setFromExpr] = useState<L2Expr | null>(null)
  const [toExpr, setToExpr] = useState<L2Expr | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    void Promise.all([
      api.getSortPack(packageId, fromVersion),
      api.getSortPack(packageId, toVersion),
    ])
      .then(([fromRes, toRes]) => {
        setFromExpr(fromRes.package.sortKey)
        setToExpr(toRes.package.sortKey)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load versions')
        setFromExpr(null)
        setToExpr(null)
      })
      .finally(() => setLoading(false))
  }, [packageId, fromVersion, toVersion])

  const fields = variant === 'personalization' ? PERSONALIZATION_FIELDS : FORMULA_FIELDS

  return (
    <div className="logic-block-version-compare sort-pack-version-compare">
      <header className="logic-block-version-compare-head">
        <div>
          <h3>{title}</h3>
          <p className="card-hint">v{fromVersion} → v{toVersion}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </header>

      {loading ? <p className="card-hint">Loading versions…</p> : null}
      {error ? <p className="field-error">{error}</p> : null}

      {!loading && !error && fromExpr && toExpr ? (
        <div className="sort-pack-version-compare-grid">
          <section>
            <p className="sidebar-block-title">v{fromVersion}</p>
            <FeedFormulaPreviewPanel expr={fromExpr} variant={variant} />
            <p className="card-hint">
              <code>{exprToFormula(fromExpr, fields)}</code>
            </p>
          </section>
          <section>
            <p className="sidebar-block-title">v{toVersion}</p>
            <FeedFormulaPreviewPanel expr={toExpr} variant={variant} />
            <p className="card-hint">
              <code>{exprToFormula(toExpr, fields)}</code>
            </p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
