import type { PostSearchField } from '@cfb/core-types'
import { DEFAULT_SEARCH_FIELDS, SEARCH_FIELD_OPTIONS } from '../../lib/search-fields'
import { ToggleRow } from '../ToggleRow'

interface Props {
  fields: PostSearchField[]
  onChange: (fields: PostSearchField[]) => void
}

export function SearchFieldPicker({ fields: fieldsProp, onChange }: Props) {
  const fields = fieldsProp ?? []
  const selected = new Set(fields.length > 0 ? fields : DEFAULT_SEARCH_FIELDS)

  const toggle = (field: PostSearchField) => {
    const next = new Set(selected)
    if (next.has(field)) {
      if (next.size <= 1) return
      next.delete(field)
    } else {
      next.add(field)
    }
    onChange(SEARCH_FIELD_OPTIONS.map((o) => o.field).filter((f) => next.has(f)))
  }

  return (
    <div className="option-toggle-list" role="group" aria-label="Search fields">
      {SEARCH_FIELD_OPTIONS.map((opt) => (
        <ToggleRow
          key={opt.field}
          label={opt.label}
          checked={selected.has(opt.field)}
          onChange={() => toggle(opt.field)}
          ariaLabel={`Search ${opt.label}`}
          disabled={selected.has(opt.field) && selected.size <= 1}
        />
      ))}
    </div>
  )
}
