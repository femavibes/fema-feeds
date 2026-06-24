import type { PostUrlSource } from '@cfb/core-types'
import { DEFAULT_URL_SOURCES, URL_SOURCE_OPTIONS } from '../../lib/url-sources'
import { ToggleRow } from '../ToggleRow'

interface Props {
  sources: PostUrlSource[]
  onChange: (sources: PostUrlSource[]) => void
}

export function UrlSourcePicker({ sources, onChange }: Props) {
  const selected = new Set(sources.length > 0 ? sources : DEFAULT_URL_SOURCES)

  const toggle = (source: PostUrlSource) => {
    const next = new Set(selected)
    if (next.has(source)) {
      if (next.size <= 1) return
      next.delete(source)
    } else {
      next.add(source)
    }
    onChange(URL_SOURCE_OPTIONS.map((o) => o.source).filter((s) => next.has(s)))
  }

  return (
    <div className="option-toggle-list" role="group" aria-label="URL sources">
      {URL_SOURCE_OPTIONS.map((opt) => (
        <ToggleRow
          key={opt.source}
          label={opt.label}
          checked={selected.has(opt.source)}
          onChange={() => toggle(opt.source)}
          ariaLabel={`Match ${opt.label}`}
          disabled={selected.has(opt.source) && selected.size <= 1}
          hint={opt.hint}
        />
      ))}
    </div>
  )
}
