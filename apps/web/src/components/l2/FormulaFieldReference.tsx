import { useState } from 'react'

import type { FormulaFieldLegendEntry } from './formula-field-legend-data'

function FormulaReferenceIcon() {
  return (
    <svg
      className="formula-field-ref-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  )
}

interface Props {
  entries: FormulaFieldLegendEntry[]
  toggleLabel?: string
  hideLabel?: string
  hint?: string
}

export function FormulaFieldReference({
  entries,
  toggleLabel = 'Field reference',
  hideLabel = 'Hide reference',
  hint,
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="formula-field-ref-wrap">
      <div className="formula-field-ref-head">
        {hint ? <p className="card-hint formula-field-ref-hint">{hint}</p> : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm formula-field-ref-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <FormulaReferenceIcon />
          <span>{open ? hideLabel : toggleLabel}</span>
        </button>
      </div>
      {open ? (
        <div className="formula-field-legend-panel">
          <dl className="formula-field-legend">
            {entries.flatMap((entry) => [
              <dt key={`${entry.name}-term`}>{entry.name}</dt>,
              <dd key={`${entry.name}-desc`}>{entry.description}</dd>,
            ])}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
