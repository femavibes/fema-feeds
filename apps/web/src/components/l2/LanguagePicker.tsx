import { useState } from 'react'
import { COMMON_LANGUAGES, isKnownLanguageCode } from '../../lib/languages'
import { ToggleRow } from '../ToggleRow'

interface Props {
  allow: string[]
  onChange: (allow: string[]) => void
}

export function LanguagePicker({ allow: allowProp, onChange }: Props) {
  const allow = allowProp ?? []
  const [customInput, setCustomInput] = useState('')
  const selected = new Set(allow.map((c) => c.toLowerCase()))
  const customCodes = allow.filter((c) => !isKnownLanguageCode(c))

  const toggle = (code: string) => {
    const key = code.toLowerCase()
    if (selected.has(key)) {
      onChange(allow.filter((c) => c.toLowerCase() !== key))
    } else {
      onChange([...allow, code.toLowerCase()])
    }
  }

  const addCustom = () => {
    const code = customInput.trim().toLowerCase()
    if (!code || selected.has(code)) return
    onChange([...allow, code])
    setCustomInput('')
  }

  return (
    <div className="l2-lang-picker">
      <div className="option-toggle-list l2-lang-toggle-list" role="group" aria-label="Allowed languages">
        {COMMON_LANGUAGES.map((lang) => (
          <ToggleRow
            key={lang.code}
            label={`${lang.name} (${lang.code})`}
            checked={selected.has(lang.code)}
            onChange={() => toggle(lang.code)}
            ariaLabel={`Allow ${lang.name}`}
          />
        ))}
        {customCodes.map((code) => (
          <ToggleRow
            key={code}
            label={code}
            checked
            onChange={() => toggle(code)}
            ariaLabel={`Allow ${code}`}
          />
        ))}
      </div>
      <div className="l2-lang-custom-add">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Other code (e.g. pt-BR)"
          className="mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCustom}>
          Add
        </button>
      </div>
    </div>
  )
}
