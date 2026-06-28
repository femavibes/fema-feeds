import { useId, useMemo, useRef, useState } from 'react'

interface Props {
  terms: string[]
  onChange: (terms: string[]) => void
  placeholder?: string
  searchable?: boolean
  /** Match duplicate detection to keyword case-sensitivity (default: false). */
  caseSensitive?: boolean
  /** Strip leading # on add/edit (hashtags). */
  stripHash?: boolean
  /** Strip leading @ on add/edit (mentions). */
  stripAt?: boolean
  /** Noun for search UI copy — e.g. keyword, hashtag. */
  itemNoun?: string
  /** Show values without edit controls (logic block preview, etc.). */
  readOnly?: boolean
}

function storeTerm(value: string, stripHash: boolean, stripAt: boolean): string {
  let trimmed = value.trim()
  if (stripHash) trimmed = trimmed.replace(/^#+/, '')
  if (stripAt) trimmed = trimmed.replace(/^@+/, '')
  return trimmed
}

function termKey(term: string, caseSensitive: boolean, stripHash: boolean, stripAt: boolean): string {
  const stored = storeTerm(term, stripHash, stripAt)
  return caseSensitive ? stored : stored.toLowerCase()
}

function duplicateIndices(
  terms: string[],
  caseSensitive: boolean,
  stripHash: boolean,
  stripAt: boolean,
): Set<number> {
  const seen = new Map<string, number>()
  const dupes = new Set<number>()
  for (let i = 0; i < terms.length; i++) {
    const key = termKey(terms[i] ?? '', caseSensitive, stripHash, stripAt)
    if (!key) continue
    const prev = seen.get(key)
    if (prev !== undefined) {
      dupes.add(prev)
      dupes.add(i)
    } else {
      seen.set(key, i)
    }
  }
  return dupes
}

export function TermListEditor({
  terms: termsProp,
  onChange,
  placeholder = 'term',
  searchable = false,
  caseSensitive = false,
  stripHash = false,
  stripAt = false,
  itemNoun = 'keyword',
  readOnly = false,
}: Props) {
  const terms = termsProp ?? []
  const [newTerm, setNewTerm] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const hintId = useId()

  const dupes = useMemo(
    () => duplicateIndices(terms, caseSensitive, stripHash, stripAt),
    [terms, caseSensitive, stripHash, stripAt],
  )
  const searchKey = search.trim()
  const searchNorm = storeTerm(searchKey, stripHash, stripAt)
  const searchLower = caseSensitive ? searchNorm : searchNorm.toLowerCase()

  const visible = useMemo(() => {
    const rows = terms.map((term, index) => ({ term, index }))
    if (!searchNorm) return rows
    return rows.filter(({ term }) => {
      const hay = caseSensitive ? term : term.toLowerCase()
      const needle = caseSensitive ? searchNorm : searchNorm.toLowerCase()
      return hay.includes(needle)
    })
  }, [terms, searchNorm, caseSensitive])

  const exactExists =
    searchNorm.length > 0 &&
    terms.some((t) => termKey(t, caseSensitive, stripHash, stripAt) === termKey(searchNorm, caseSensitive, stripHash, stripAt))

  const commitNew = () => {
    const value = storeTerm(newTerm, stripHash, stripAt)
    if (!value) {
      setNewTerm('')
      setAddError(null)
      return
    }
    const key = termKey(value, caseSensitive, stripHash, stripAt)
    if (terms.some((t) => termKey(t, caseSensitive, stripHash, stripAt) === key)) {
      setAddError('Already in list')
      return
    }
    onChange([...terms, value])
    setNewTerm('')
    setAddError(null)
    requestAnimationFrame(() => addInputRef.current?.focus())
  }

  const updateTerm = (index: number, value: string) => {
    setAddError(null)
    onChange(terms.map((t, i) => (i === index ? value : t)))
  }

  const finalizeTerm = (index: number, value: string) => {
    const stored = storeTerm(value, stripHash, stripAt)
    if (!stored) {
      onChange(terms.filter((_, i) => i !== index))
      return
    }
    const key = termKey(stored, caseSensitive, stripHash, stripAt)
    const clash = terms.some((t, i) => i !== index && termKey(t, caseSensitive, stripHash, stripAt) === key)
    if (clash) return
    onChange(terms.map((t, i) => (i === index ? stored : t)))
  }

  const searchLabel =
    itemNoun === 'hashtag'
      ? 'Search hashtags…'
      : itemNoun === 'account'
        ? 'Search accounts…'
        : 'Search keywords…'

  if (readOnly) {
    return (
      <div className="term-list-panel term-list-panel--readonly">
        {terms.length === 0 ? (
          <p className="card-hint term-list-readonly-empty">
            No {itemNoun}s configured.
          </p>
        ) : (
          <ul className="term-list-readonly">
            {terms.map((term, index) => (
              <li key={`${index}-${term}`} className="term-list-readonly-item">
                {term}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="term-list-panel">
      {searchable ? (
        <div className="term-list-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
            className="term-list-search-input"
          />
          {searchNorm ? (
            <span
              className={`term-list-search-meta${exactExists ? ' term-list-search-meta-hit' : ' term-list-search-meta-miss'}`}
            >
              {exactExists
                ? 'Already in list'
                : visible.length > 0
                  ? `${visible.length} match${visible.length === 1 ? '' : 'es'}`
                  : 'Not in list'}
            </span>
          ) : null}
        </div>
      ) : null}

      {dupes.size > 0 ? (
        <p className="term-list-dupes-warn" role="status">
          {dupes.size} duplicate{dupes.size === 1 ? '' : 's'}
          {caseSensitive ? '' : ' (case-insensitive)'}
        </p>
      ) : null}

      <div className="term-list-editor">
        {visible.map(({ term, index }) => (
          <div
            key={index}
            className={`term-list-row${dupes.has(index) ? ' term-list-row--duplicate' : ''}${
              searchNorm && termKey(term, caseSensitive, stripHash, stripAt) === termKey(searchNorm, caseSensitive, stripHash, stripAt)
                ? ' term-list-row--search-hit'
                : ''
            }`}
          >
            <input
              value={term}
              onChange={(e) => updateTerm(index, e.target.value)}
              onBlur={(e) => finalizeTerm(index, e.target.value)}
              placeholder={placeholder}
              aria-invalid={dupes.has(index)}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm term-list-remove"
              onClick={() => onChange(terms.filter((_, i) => i !== index))}
              aria-label={`Remove ${term || 'term'}`}
            >
              ×
            </button>
          </div>
        ))}

        {!searchNorm ? (
          <div className="term-list-add-block">
            <div className={`term-list-row term-list-row-new${addError ? ' term-list-row--error' : ''}`}>
              <input
                ref={addInputRef}
                value={newTerm}
                onChange={(e) => {
                  setNewTerm(e.target.value)
                  setAddError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNew()
                  }
                }}
                onBlur={commitNew}
                placeholder={terms.length === 0 ? `Add ${placeholder}…` : 'Add another…'}
                aria-invalid={Boolean(addError)}
                aria-describedby={hintId}
              />
              <span className="term-list-enter-hint" aria-hidden="true">
                <kbd>Enter</kbd>
              </span>
            </div>
            <p id={hintId} className="term-list-add-hint">
              Press Enter to add — a new field opens for the next {itemNoun}
            </p>
          </div>
        ) : null}
      </div>

      {addError ? <p className="term-list-add-error">{addError}</p> : null}
    </div>
  )
}
