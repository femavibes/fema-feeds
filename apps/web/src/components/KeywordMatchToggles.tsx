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
  onPinParamBaseline,
}: Props) {
  return (
    <div className="option-toggle-list" role="group" aria-label="Keyword match options">
      <ToggleRow
        label="Case sensitive"
        checked={caseSensitive === true}
        onChange={(checked) => {
          if (paramOverriddenProps?.has('caseSensitive')) {
            onPinParamBaseline?.('caseSensitive')
          }
          onChange({ caseSensitive: checked, wholeWord })
        }}
        ariaLabel="Case sensitive keyword matching"
        readOnly={readOnly || caseSensitiveReadOnly}
        paramLive={paramOverriddenProps?.has('caseSensitive')}
      />
      <ToggleRow
        label="Whole words only"
        checked={wholeWord === true}
        onChange={(checked) => {
          if (paramOverriddenProps?.has('wholeWord')) {
            onPinParamBaseline?.('wholeWord')
          }
          onChange({ caseSensitive, wholeWord: checked })
        }}
        ariaLabel="Match whole words only"
        readOnly={readOnly || wholeWordReadOnly}
        paramLive={paramOverriddenProps?.has('wholeWord')}
      />
    </div>
  )
}
