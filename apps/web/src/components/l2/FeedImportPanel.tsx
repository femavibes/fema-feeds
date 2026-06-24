import { useState } from 'react'
import type { FeedConfig } from '@cfb/core-types'
import { countImportableConditions, importFeedGenRules } from '@cfb/l2-graph'

interface Props {
  draft: FeedConfig
  onImportMatch: (match: FeedConfig['match']) => void
}

function matchHasRules(match: FeedConfig['match']): boolean {
  if (match.children.length === 0) return false
  if (match.children.length > 1) return true
  const only = match.children[0]
  if (only?.type === 'group') return only.children.length > 0
  return true
}

export function FeedImportPanel({ draft, onImportMatch }: Props) {
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const run = () => {
    setError(null)
    setResult(null)
    try {
      let rules: unknown
      try {
        rules = JSON.parse(json) as unknown
      } catch {
        throw new Error('Invalid JSON')
      }

      const match = importFeedGenRules(rules)
      if (!match) {
        throw new Error(
          'Unrecognized format. Paste Graze manifest.filter, feed-gen groups, or visual graph JSON.',
        )
      }

      if (matchHasRules(draft.match)) {
        const ok = window.confirm(
          'Replace all match rules in this feed? Your current rules will be discarded from the editor (not saved until you click Save feed).',
        )
        if (!ok) return
      }

      onImportMatch(match)
      const count = countImportableConditions(match)
      setResult(`Converted ${count} rule node(s) into CFB format. Save the feed to keep them.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <section className="card l2-import">
      <h3>Import &amp; convert</h3>
      <p className="card-hint">
        Feeds are stored in <strong>CFB format</strong> (nested groups with <code>logic: all|any|none</code>{' '}
        and typed conditions like <code>text</code>, <code>hashtag</code>, <code>author</code>) — not Graze
        JSON. This panel is a <strong>one-way migration helper</strong>: paste Graze{' '}
        <code>manifest.filter</code>, legacy feed-gen, or visual graph JSON and we map it into our model.
        Unsupported Graze node types become editable stubs you can replace.
      </p>
      <textarea
        className="l2-import-textarea"
        rows={6}
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='Graze: {"manifest":{"filter":{"and":[...]}}} — or CFB is saved separately when you Save feed'
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!json.trim()}
        onClick={run}
      >
        Convert into editor
      </button>
      {error && <p className="field-error">{error}</p>}
      {result && <p className="dry-run-headline">{result}</p>}
    </section>
  )
}
