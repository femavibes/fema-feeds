import type { PostSearchField } from '@cfb/core-types'
import { SEARCH_FIELD_OPTIONS } from '../../lib/search-fields'
import { ToggleRow } from '../ToggleRow'

interface Props {
  fields: PostSearchField[]
  /** Authored baseline (green) — written when reclaiming a Param-driven toggle. */
  baselineFields?: PostSearchField[]
  /** Search fields with a Param bind on this node — manual edits auto-pin. */
  paramBoundFields?: ReadonlySet<string>
  onChange: (fields: PostSearchField[]) => void
  readOnly?: boolean
  /** Individual search-field toggles showing Param override (blue). */
  paramOverriddenFields?: ReadonlySet<string>
  /** Individual search-field toggles driven by Live Params (teal). */
  paramProductionFields?: ReadonlySet<string>
  /** Fields the user pinned (baseline override) — not inferred from param-off state. */
  pinnedFields?: ReadonlySet<string>
  onPinParamBaseline?: (field: PostSearchField) => void
}

function orderedFields(selected: Set<PostSearchField>): PostSearchField[] {
  return SEARCH_FIELD_OPTIONS.map((o) => o.field).filter((f) => selected.has(f))
}

export function SearchFieldPicker({
  fields: fieldsProp,
  baselineFields,
  paramBoundFields,
  onChange,
  readOnly = false,
  paramOverriddenFields,
  paramProductionFields,
  pinnedFields,
  onPinParamBaseline,
}: Props) {
  const selected = new Set(fieldsProp ?? [])

  return (
    <div className="option-toggle-list" role="group" aria-label="Search fields">
      {SEARCH_FIELD_OPTIONS.map((opt) => (
        <ToggleRow
          key={opt.field}
          label={opt.label}
          checked={selected.has(opt.field)}
          onChange={(checked) => {
            const paramDriven =
              paramOverriddenFields?.has(opt.field) || paramProductionFields?.has(opt.field)
            const pinned = pinnedFields?.has(opt.field) ?? false
            if (pinned) {
              onPinParamBaseline?.(opt.field)
              return
            }
            if (paramDriven) {
              onPinParamBaseline?.(opt.field)
              const base = new Set(baselineFields ?? [])
              if (checked) base.add(opt.field)
              else base.delete(opt.field)
              onChange(orderedFields(base))
              return
            }
            const next = new Set(selected)
            if (checked) next.add(opt.field)
            else next.delete(opt.field)
            onChange(orderedFields(next))
          }}
          ariaLabel={`Search ${opt.label}`}
          readOnly={readOnly}
          paramProduction={paramProductionFields?.has(opt.field)}
          paramLive={
            paramOverriddenFields?.has(opt.field) && !paramProductionFields?.has(opt.field)
          }
          nodeAuthored={
            !paramOverriddenFields?.has(opt.field) && !paramProductionFields?.has(opt.field)
          }
        />
      ))}
    </div>
  )
}
