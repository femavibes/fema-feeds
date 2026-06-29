import { useCallback, useEffect, useRef, useState } from 'react'
import type { L2Expr } from '@cfb/core-types'
import {
  parseFormula,
  exprToFormula,
  FORMULA_FIELDS,
  FORMULA_FUNCTIONS,
} from '../../lib/formula-parser'

interface Props {
  draft: { rank?: { sortKey?: L2Expr } }
  onChange: (expr: L2Expr) => void
}

const TEMPLATES: { name: string; formula: string }[] = [
  { name: 'Engagement', formula: 'likes + reposts * 2 + replies' },
  { name: 'Log engagement', formula: 'log(likes + 1) * 10 + log(reposts + 1) * 15' },
  { name: 'Engagement rate', formula: '(likes + reposts) / (followers + 1) * 100' },
  { name: 'Sqrt fairness', formula: '(likes + reposts * 2) / (sqrt(followers) + 1)' },
  { name: 'Power curve', formula: 'pow(likes + 1, 0.7) * 10' },
  { name: 'Capped engagement', formula: 'clamp(likes * 2 + reposts * 3, 0, 1000)' },
  { name: 'Video boost', formula: 'likes + reposts * 2 + if(video_size > 0, 50, 0)' },
  { name: 'Time decay', formula: '(likes + reposts * 2) / (age_hours / 24 + 1)' },
  { name: 'Discussion finder', formula: 'replies * 3 + quotes * 5 - likes * 0.1' },
  { name: 'Small account boost', formula: '(likes + reposts) * max(1, 100 / (followers + 1))' },
]

export function SortFormulaBuilder({ draft, onChange }: Props) {
  const [text, setText] = useState(() => {
    if (draft.rank?.sortKey) {
      try { return exprToFormula(draft.rank.sortKey) } catch { /* fallback */ }
    }
    return 'likes + reposts * 2 + replies'
  })
  const [error, setError] = useState<string | null>(null)
  const [errorPos, setErrorPos] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [compiledExpr, setCompiledExpr] = useState<L2Expr | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const compile = useCallback((formula: string) => {
    const result = parseFormula(formula)
    if (result.ok) {
      setError(null)
      setErrorPos(null)
      setCompiledExpr(result.expr)
      onChange(result.expr)
    } else {
      setError(result.error.message)
      setErrorPos(result.error.pos)
      setCompiledExpr(null)
    }
  }, [onChange])

  useEffect(() => {
    compile(text)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    setText(value)
    compile(value)
  }

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current
    if (!el) { setText((prev) => prev + snippet); compile(text + snippet); return }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = text.slice(0, start) + snippet + text.slice(end)
    setText(next)
    compile(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + snippet.length
    })
  }

  const applyTemplate = (formula: string) => {
    setText(formula)
    compile(formula)
  }

  const copyExpr = () => {
    if (!compiledExpr) return
    void navigator.clipboard.writeText(JSON.stringify(compiledExpr, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="formula-editor">
      {/* Editor */}
      <section className="formula-editor-main">
        <textarea
          ref={textareaRef}
          className={`formula-editor-input${error ? ' formula-editor-input-error' : ''}`}
          rows={4}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="likes + reposts * 2 + replies"
          spellCheck={false}
        />
        {error && (
          <p className="formula-editor-error">
            ⚠ {error}{errorPos != null ? ` (position ${errorPos})` : ''}
          </p>
        )}
        {!error && <p className="formula-editor-valid">✓ Valid formula</p>}
      </section>

      {/* Fields reference */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Fields <span className="sfb-hint">(click to insert)</span></p>
        <div className="formula-editor-chips">
          {Object.keys(FORMULA_FIELDS).map((name) => (
            <button
              key={name}
              type="button"
              className="formula-editor-chip"
              onClick={() => insertAtCursor(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {/* Functions reference */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Functions <span className="sfb-hint">(click to insert)</span></p>
        <div className="formula-editor-chips">
          {FORMULA_FUNCTIONS.map((fn) => (
            <button
              key={fn}
              type="button"
              className="formula-editor-chip formula-editor-chip-fn"
              onClick={() => insertAtCursor(fn === 'if' ? 'if(likes > 10, ' : `${fn}(`)}
            >
              {fn}()
            </button>
          ))}
        </div>
        <p className="card-hint">
          Operators: + - * / ** (power) &nbsp;|&nbsp; Comparisons (in if): &gt; &gt;= &lt; &lt;= == !=
        </p>
      </section>

      {/* Templates */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Templates <span className="sfb-hint">(click to apply)</span></p>
        <div className="formula-editor-templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              type="button"
              className="formula-editor-template"
              onClick={() => applyTemplate(t.formula)}
            >
              <span className="formula-editor-template-name">{t.name}</span>
              <code className="formula-editor-template-code">{t.formula}</code>
            </button>
          ))}
        </div>
      </section>

      {/* Raw JSON output */}
      <section className="formula-editor-ref">
        <div className="feed-sorting-custom-header">
          <p className="sidebar-block-title">Compiled expression</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyExpr} disabled={!compiledExpr}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
        {compiledExpr && (
          <textarea
            className="feed-sorting-custom-expr"
            rows={5}
            value={JSON.stringify(compiledExpr, null, 2)}
            readOnly
          />
        )}
      </section>
    </div>
  )
}
