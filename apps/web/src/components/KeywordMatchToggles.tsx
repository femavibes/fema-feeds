import type { KeywordMatchOptions } from '@cfb/core-types'
import { ToggleRow } from './ToggleRow'

interface Props extends KeywordMatchOptions {
  onChange: (next: KeywordMatchOptions) => void
}

export function KeywordMatchToggles({ caseSensitive, wholeWord, onChange }: Props) {
  return (
    <div className="option-toggle-list" role="group" aria-label="Keyword match options">
      <ToggleRow
        label="Case sensitive"
        checked={caseSensitive === true}
        onChange={(checked) => onChange({ caseSensitive: checked, wholeWord })}
        ariaLabel="Case sensitive keyword matching"
      />
      <ToggleRow
        label="Whole words only"
        checked={wholeWord === true}
        onChange={(checked) => onChange({ caseSensitive, wholeWord: checked })}
        ariaLabel="Match whole words only"
      />
    </div>
  )
}
