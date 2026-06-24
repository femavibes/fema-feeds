import { useState } from 'react'

interface Props {
  title: string
  uri?: string
}

export function AuthorListSourceSummary({ title, uri }: Props) {
  const [copied, setCopied] = useState(false)

  const copyUri = async () => {
    if (!uri) return
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="l2-author-list-summary">
      <strong className="l2-author-list-summary-title">{title}</strong>
      {uri ? (
        <button
          type="button"
          className="l2-author-list-uri-copy"
          onClick={() => void copyUri()}
          title={`Copy list URL\n${uri}`}
        >
          <span className="l2-author-list-uri-text mono">{uri}</span>
          <span className="l2-author-list-uri-action">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      ) : null}
    </div>
  )
}
