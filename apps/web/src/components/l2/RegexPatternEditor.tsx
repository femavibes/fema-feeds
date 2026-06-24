import { useMemo, useState } from 'react'
import { REGEX_ENGINE_LABEL, compileRegex, textMatchesRegex } from '@cfb/core-types'

interface Props {
  pattern: string
  caseInsensitive: boolean
  onChange: (pattern: string) => void
}

export function RegexPatternEditor({ pattern, caseInsensitive, onChange }: Props) {
  const [sample, setSample] = useState('love urbanism and transit')

  const compiled = useMemo(
    () => compileRegex(pattern, caseInsensitive),
    [pattern, caseInsensitive],
  )

  const tester = useMemo(() => {
    if (!pattern.trim()) {
      return { status: 'empty' as const, message: 'Empty pattern — all posts pass (no filter)' }
    }
    if ('error' in compiled) {
      return { status: 'invalid' as const, message: compiled.error }
    }
    if (!sample.trim()) {
      return { status: 'idle' as const, message: 'Enter sample text below' }
    }
    const hit = textMatchesRegex(sample, pattern, caseInsensitive)
    return hit
      ? { status: 'match' as const, message: 'Matches sample text' }
      : { status: 'miss' as const, message: 'Does not match sample text' }
  }, [pattern, caseInsensitive, compiled, sample])

  return (
    <div className="regex-pattern-editor">
      <label className="regex-pattern-field">
        <span className="regex-pattern-label">Pattern</span>
        <textarea
          className="mono l2-regex-pattern"
          value={pattern}
          onChange={(e) => onChange(e.target.value)}
          placeholder="bike|transit or \\bdog\\b"
          spellCheck={false}
          rows={3}
          wrap="soft"
        />
      </label>
      <p className="l2-condition-hint regex-engine-note">
        <strong>{REGEX_ENGINE_LABEL}</strong>
        {' · '}
        {pattern.trim()
          ? caseInsensitive
            ? 'case insensitive (`i` flag)'
            : 'case sensitive'
          : 'empty pattern matches all posts'}
        {' · '}
        matched against joined search fields (newline-separated)
      </p>

      <div className="regex-tester">
        <label className="regex-pattern-field">
          <span className="regex-pattern-label">Regex Tester</span>
          <textarea
            className="mono regex-tester-sample"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder="Paste sample post text…"
            spellCheck={false}
            rows={3}
            wrap="soft"
          />
        </label>
        <p className={`regex-tester-result regex-tester-result--${tester.status}`} role="status">
          {tester.message}
        </p>
      </div>
    </div>
  )
}
