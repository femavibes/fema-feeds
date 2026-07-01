import { useCallback, useEffect, useRef, useState } from 'react'
import type { L2Expr } from '@cfb/core-types'
import {
  parseFormula,
  exprToFormula,
  FORMULA_FIELDS,
  FORMULA_FUNCTIONS,
} from '../../lib/formula-parser'
import { FormulaBlocks, type FormulaBlockActions } from './FormulaBlocks'

export interface FormulaTemplate {
  name: string
  formula: string
}

export interface FormulaFieldGroup {
  label: string
  fields: string[]
}

interface Props {
  draft: { rank?: { sortKey?: L2Expr } }
  onChange: (expr: L2Expr) => void
  /** Initial expression to display (overrides draft.rank.sortKey). */
  initialExpr?: L2Expr | null
  /** Custom field map (alias → L2NumericField). Defaults to FORMULA_FIELDS (sorting). */
  fields?: Record<string, string>
  /** Optional grouped display of fields. If provided, renders groups with labels instead of a flat list. */
  fieldGroups?: FormulaFieldGroup[]
  /** Custom templates. Defaults to SORT_TEMPLATES. */
  templates?: FormulaTemplate[]
  /** Placeholder text for the formula editor. */
  placeholder?: string
}

const SORT_FIELD_GROUPS: FormulaFieldGroup[] = [
  {
    label: 'Post metrics',
    fields: ['likes', 'reposts', 'replies', 'quotes', 'bookmarks', 'followers', 'follows', 'posts'],
  },
  {
    label: 'Content',
    fields: ['text_len', 'images', 'video_size', 'hashtags', 'links', 'mentions', 'editor_score', 'age_hours'],
  },
]

const SORT_TEMPLATES: FormulaTemplate[] = [
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

export function SortFormulaBuilder({ draft, onChange, initialExpr, fields, fieldGroups, templates, placeholder }: Props) {
  const fieldMap = fields ?? FORMULA_FIELDS
  const groups = fieldGroups ?? SORT_FIELD_GROUPS
  const templateList = templates ?? SORT_TEMPLATES
  const placeholderText = placeholder ?? 'likes + reposts * 2 + replies'

  const [text, setText] = useState(() => {
    const expr = initialExpr ?? draft.rank?.sortKey
    if (expr) {
      try { return exprToFormula(expr, fieldMap) } catch { /* fallback */ }
    }
    return templateList[0]?.formula ?? 'likes + reposts * 2 + replies'
  })
  const [error, setError] = useState<string | null>(null)
  const [errorPos, setErrorPos] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [compiledExpr, setCompiledExpr] = useState<L2Expr | null>(() => {
    const expr = initialExpr ?? draft.rank?.sortKey
    const formulaText = expr ? exprToFormula(expr, fieldMap) : (templateList[0]?.formula ?? 'likes + reposts * 2 + replies')
    const result = parseFormula(formulaText, fieldMap)
    return result.ok ? result.expr : null
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const blockActionsRef = useRef<FormulaBlockActions | null>(null)

  const compile = useCallback((formula: string) => {
    const result = parseFormula(formula, fieldMap)
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
  }, [onChange, fieldMap])

  useEffect(() => {
    compile(text)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (value: string) => {
    setText(value)
    compile(value)
  }

  const insertRaw = (snippet: string) => {
    const el = textareaRef.current
    if (!el) {
      const next = text + snippet
      setText(next)
      compile(next)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = text.slice(0, start) + snippet + text.slice(end)
    setText(next)
    compile(next)
    const newPos = start + snippet.length
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = newPos
    })
  }

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current
    if (!el) {
      const prev = text.trim()
      const next = prev ? `${prev} + ${snippet}` : snippet
      setText(next)
      compile(next)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = text.slice(0, start)
    const after = text.slice(end)
    // Always insert " + " if there's any non-whitespace before and it doesn't end with an operator or open paren
    const beforeTrimmed = before.trimEnd()
    const lastChar = beforeTrimmed.slice(-1)
    const endsWithOp = lastChar === '' || '+-*/('.includes(lastChar) || beforeTrimmed.endsWith('**')
    const prefix = endsWithOp ? (before.endsWith(' ') || before === '' ? '' : ' ') : ' + '
    // Also check if after starts with something that needs spacing
    const afterChar = after.trimStart().charAt(0)
    const suffix = afterChar && !'+-*/)'.includes(afterChar) && afterChar !== '' ? ' + ' : ''
    const next = before + prefix + snippet + suffix + after
    setText(next)
    compile(next)
    const newPos = before.length + prefix.length + snippet.length
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = newPos
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
          placeholder={placeholderText}
          spellCheck={false}
        />
        {error && (
          <p className="formula-editor-error">
            ⚠ {error}{errorPos != null ? ` (position ${errorPos})` : ''}
          </p>
        )}
        {!error && <p className="formula-editor-valid">✓ Valid formula</p>}
      </section>

      {/* Visual blocks */}
      <section className="formula-editor-blocks">
        <p className="sidebar-block-title">Blocks <span className="sfb-hint">(drag to reorder, click to edit)</span></p>
        <FormulaBlocks expr={compiledExpr} formulaText={text} error={error} onUpdate={handleChange} actionsRef={blockActionsRef} fields={fieldMap} />
      </section>

      {/* Fields reference */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Fields <span className="sfb-hint">(click to add block)</span></p>
        {groups.map((group) => (
          <div key={group.label} className="formula-editor-field-group">
            <p className="formula-editor-field-group-label">{group.label}</p>
            <div className="formula-editor-chips">
              {group.fields.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="formula-editor-chip"
                  onClick={() => blockActionsRef.current?.insertBlockAfter(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Numbers & comparisons */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Numbers & values <span className="sfb-hint">(click to add block)</span></p>
        <div className="formula-editor-chips">
          {['0', '0.5', '1', '2', '3', '10', '50', '100'].map((n) => (
            <button
              key={n}
              type="button"
              className="formula-editor-chip"
              onClick={() => blockActionsRef.current?.insertBlockAfter(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* Functions reference */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Functions <span className="sfb-hint">(click to wrap selected block)</span></p>
        <div className="formula-editor-chips">
          {FORMULA_FUNCTIONS.filter((fn) => fn !== 'if').map((fn) => (
            <button
              key={fn}
              type="button"
              className="formula-editor-chip formula-editor-chip-fn"
              onClick={() => blockActionsRef.current?.wrapSelectedWith(fn)}
            >
              {fn}()
            </button>
          ))}
        </div>
        <p className="card-hint">
          Select a block, then click a function to wrap it.
        </p>
      </section>

      {/* Templates */}
      <section className="formula-editor-ref">
        <p className="sidebar-block-title">Templates <span className="sfb-hint">(click to apply)</span></p>
        <div className="formula-editor-templates">
          {templateList.map((t) => (
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
