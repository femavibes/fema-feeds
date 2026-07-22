import type { KeywordMatchOptions } from '@cfb/core-types'
import { ToggleRow } from './ToggleRow'

interface Props extends KeywordMatchOptions {
  onChange: (next: KeywordMatchOptions) => void
  readOnly?: boolean
  /** Lock individual toggles (e.g. Parameter-owned fields). */
  caseSensitiveReadOnly?: boolean
  wholeWordReadOnly?: boolean
  /** Props showing a live Parameter override (styled, baseline unchanged). */
  paramOverriddenProps?: ReadonlySet<string>
  /** Props driven by production Params (teal). */
  paramProductionProps?: ReadonlySet<string>
  onPinParamBaseline?: (property: string) => void
}

export function KeywordMatchToggles({
  caseSensitive,
  wholeWord,
  onChange,
  readOnly = false,
  caseSensitiveReadOnly = false,
  wholeWordReadOnly = false,
  paramOverriddenProps,
  paramProductionProps,
  onPinParamBaseline,
}: Props) {
  return (
    <div className="option-toggle-list" role="group" aria-label="Keyword match options">
      <ToggleRow
        label="Case sensitive"
        checked={caseSensitive === true}
        onChange={(checked) => {
          if (paramOverriddenProps?.has('caseSensitive') || paramProductionProps?.has('caseSensitive')) {
            onPinParamBaseline?.('caseSensitive')
          }
          onChange({ caseSensitive: checked, wholeWord })
        }}
        ariaLabel="Case sensitive keyword matching"
        readOnly={readOnly || caseSensitiveReadOnly}
        paramProduction={paramProductionProps?.has('caseSensitive')}
        paramLive={
          paramOverriddenProps?.has('caseSensitive') && !paramProductionProps?.has('caseSensitive')
        }
        nodeAuthored={
          !paramOverriddenProps?.has('caseSensitive') && !paramProductionProps?.has('caseSensitive')
        }
      />
      <ToggleRow
        label="Whole words only"
        checked={wholeWord === true}
        onChange={(checked) => {
          if (paramOverriddenProps?.has('wholeWord') || paramProductionProps?.has('wholeWord')) {
            onPinParamBaseline?.('wholeWord')
          }
          onChange({ caseSensitive, wholeWord: checked })
        }}
        ariaLabel="Match whole words only"
        readOnly={readOnly || wholeWordReadOnly}
        paramProduction={paramProductionProps?.has('wholeWord')}
        paramLive={paramOverriddenProps?.has('wholeWord') && !paramProductionProps?.has('wholeWord')}
        nodeAuthored={
          !paramOverriddenProps?.has('wholeWord') && !paramProductionProps?.has('wholeWord')
        }
      />
    </div>
  )
}
