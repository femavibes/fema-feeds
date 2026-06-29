import { useState } from 'react'
import type { L2Expr } from '@cfb/core-types'
import { parseFormula, FORMULA_FIELDS } from '../../lib/formula-parser'

interface Props {
  expr: L2Expr | null
  formulaText: string
  error?: string | null
  onUpdate: (newFormula: string) => void
  onSelectionChange?: (selectedIdx: number | null) => void
  actionsRef?: React.MutableRefObject<FormulaBlockActions | null>
}

export interface FormulaBlockActions {
  insertBlockAfter: (text: string) => void
  wrapSelectedWith: (fn: string) => void
}

interface Block {
  text: string
  negated: boolean
}

type BlockOp = '+' | '-' | '*' | '/'

/** Parse formula text into blocks + operators between them.
 *  We tokenize at top-level operators (not inside parens/functions). */
function formulaToBlocks(text: string): { blocks: Block[]; ops: BlockOp[] } {
  const blocks: Block[] = []
  const ops: BlockOp[] = []

  // Split at top-level +, -, *, / (not inside parens)
  let depth = 0
  let current = ''
  let pendingOp: BlockOp | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '(' || ch === '[') { depth++; current += ch; continue }
    if (ch === ')' || ch === ']') { depth--; current += ch; continue }

    if (depth === 0 && '+-*/'.includes(ch)) {
      // Check for ** (power) - don't split on that
      if (ch === '*' && text[i + 1] === '*') {
        current += '**'
        i++
        continue
      }
      // Check for unary minus (at start or after another operator)
      if (ch === '-' && (current.trim() === '' && blocks.length === 0)) {
        current += ch
        continue
      }

      const trimmed = current.trim()
      if (trimmed) {
        blocks.push(parseBlock(trimmed))
        if (pendingOp) ops.push(pendingOp)
        pendingOp = ch as BlockOp
      } else if (ch === '-' && pendingOp === null) {
        // Leading negative
        current += ch
        continue
      } else {
        // Operator after operator or at start — treat as unary
        current += ch
        continue
      }
      current = ''
    } else {
      current += ch
    }
  }
  // Last block
  const last = current.trim()
  if (last) {
    blocks.push(parseBlock(last))
    if (pendingOp) ops.push(pendingOp)
  }

  return { blocks, ops }
}

function parseBlock(text: string): Block {
  // Check if wrapped in -(...)
  const negMatch = text.match(/^-\((.+)\)$/)
  if (negMatch) return { text: negMatch[1]!, negated: true }
  // Check if starts with - and is a simple field/expr
  if (text.startsWith('-') && !text.startsWith('-(')) {
    const inner = text.slice(1).trim()
    // Only treat as negated if inner is a simple value (no operators at top level)
    if (inner && !inner.match(/^.*[+\-*/].*$/m)) {
      return { text: inner, negated: true }
    }
  }
  return { text, negated: false }
}

function blocksToFormula(blocks: Block[], ops: BlockOp[]): string {
  if (blocks.length === 0) return '0'
  const parts: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!
    const val = b.negated ? `-(${b.text})` : b.text
    if (i === 0) {
      parts.push(val)
    } else {
      parts.push(` ${ops[i - 1] ?? '+'} ${val}`)
    }
  }
  return parts.join('')
}

const CATEGORY_ICONS: Record<string, string> = {
  field: '📊',
  function: 'ƒ',
  condition: '⚡',
  number: '#',
  expression: '🧮',
}

function blockCategory(text: string): string {
  if (/^[0-9.]+$/.test(text)) return 'number'
  if (/^(if|clamp)\(/.test(text)) return 'condition'
  if (/^(log|sqrt|abs|pow|min|max|floor|ceil)\(/.test(text)) return 'function'
  if (/^[a-z_]+$/.test(text)) return 'field'
  return 'expression'
}

const OP_OPTIONS: BlockOp[] = ['+', '-', '*', '/']

const ADD_SNIPPETS: { label: string; text: string }[] = [
  { label: 'Likes', text: 'likes' },
  { label: 'Reposts', text: 'reposts' },
  { label: 'Replies', text: 'replies' },
  { label: 'Quotes', text: 'quotes' },
  { label: 'Bookmarks', text: 'bookmarks' },
  { label: 'Followers', text: 'followers' },
  { label: 'Log likes', text: 'log(likes + 1) * 10' },
  { label: 'Sqrt replies', text: 'sqrt(replies + 1)' },
  { label: 'Engagement rate', text: '(likes + reposts) / (followers + 1) * 100' },
  { label: 'Video bonus', text: 'if(video_size > 0, 50, 0)' },
  { label: 'Image bonus', text: 'if(images > 0, 20, 0)' },
  { label: 'Time decay', text: '(age_hours / 24 + 1)' },
  { label: 'Editor score', text: 'editor_score' },
  { label: 'Power likes', text: 'pow(likes + 1, 0.7) * 10' },
  { label: 'Custom...', text: '' },
]

export function FormulaBlocks({ expr, formulaText, error, onUpdate, onSelectionChange, actionsRef }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [customAdd, setCustomAdd] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set())
  const [multiMode, setMultiMode] = useState(false)
  const [showCondition, setShowCondition] = useState(false)
  const [condField, setCondField] = useState<string>('likes')
  const [condOp, setCondOp] = useState<string>('>')
  const [condValue, setCondValue] = useState<number>(100)
  const [condElse, setCondElse] = useState<string>('0')

  // Derive blocks from formula text directly (works even if expr is null/invalid)
  const { blocks, ops } = formulaToBlocks(formulaText)

  const selectBlock = (index: number, e?: React.MouseEvent) => {
    const next = new Set(selectedIdxs)
    const multi = multiMode || e?.shiftKey
    if (multi) {
      // Toggle this block in/out of selection
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
    } else {
      // Single select: toggle or replace
      if (next.has(index) && next.size === 1) {
        next.clear()
      } else {
        next.clear()
        next.add(index)
      }
    }
    setSelectedIdxs(next)
    onSelectionChange?.(next.size > 0 ? [...next][0]! : null)
  }

  const insertBlockAfter = (text: string) => {
    if (!text.trim()) return
    const lastSelected = selectedIdxs.size > 0 ? Math.max(...selectedIdxs) : blocks.length - 1
    const insertAt = lastSelected + 1
    const newBlocks = [...blocks]
    const newOps = [...ops]
    newBlocks.splice(insertAt, 0, { text: text.trim(), negated: false })
    if (insertAt > 0) {
      newOps.splice(insertAt - 1, 0, '+')
    }
    rebuild(newBlocks, newOps.slice(0, newBlocks.length - 1))
    setSelectedIdxs(new Set([insertAt]))
    onSelectionChange?.(insertAt)
  }

  const wrapSelectedWith = (fn: string) => {
    if (selectedIdxs.size === 0) return
    const sorted = [...selectedIdxs].sort((a, b) => a - b)
    const next = [...blocks]
    const nextOps = [...ops]

    if (fn === 'neg') {
      // Toggle negate on all selected
      for (const idx of sorted) {
        next[idx] = { ...next[idx]!, negated: !next[idx]!.negated }
      }
    } else if (sorted.length === 1) {
      // Single block: wrap its text
      const idx = sorted[0]!
      next[idx] = { ...next[idx]!, text: `${fn}(${next[idx]!.text})` }
    } else {
      // Multiple blocks: merge them into one wrapped block
      const parts: string[] = []
      for (let i = 0; i < sorted.length; i++) {
        const idx = sorted[i]!
        const block = next[idx]!
        const val = block.negated ? `-(${block.text})` : block.text
        if (i === 0) {
          parts.push(val)
        } else {
          const opIdx = sorted[i]! - 1
          const op = nextOps[opIdx] ?? '+'
          parts.push(`${op} ${val}`)
        }
      }
      const merged = parts.join(' ')
      const wrapped = `${fn}(${merged})`
      // Replace first selected with wrapped, remove the rest
      const firstIdx = sorted[0]!
      next[firstIdx] = { text: wrapped, negated: false }
      // Remove subsequent selected blocks (in reverse to keep indices stable)
      for (let i = sorted.length - 1; i > 0; i--) {
        const removeIdx = sorted[i]!
        next.splice(removeIdx, 1)
        if (removeIdx > 0) nextOps.splice(removeIdx - 1, 1)
      }
    }
    rebuild(next, nextOps.slice(0, next.length - 1))
    setSelectedIdxs(new Set([sorted[0]!]))
  }

  // Expose actions to parent
  if (actionsRef) {
    actionsRef.current = { insertBlockAfter, wrapSelectedWith }
  }

  const applyCondition = () => {
    if (selectedIdxs.size === 0) return
    const sorted = [...selectedIdxs].sort((a, b) => a - b)
    const next = [...blocks]
    const nextOps = [...ops]

    // Build the inner expression from selected blocks
    let innerParts: string[] = []
    if (sorted.length === 1) {
      const block = next[sorted[0]!]!
      innerParts = [block.negated ? `-(${block.text})` : block.text]
    } else {
      for (let i = 0; i < sorted.length; i++) {
        const idx = sorted[i]!
        const block = next[idx]!
        const val = block.negated ? `-(${block.text})` : block.text
        if (i === 0) {
          innerParts.push(val)
        } else {
          const opIdx = sorted[i]! - 1
          const op = nextOps[opIdx] ?? '+'
          innerParts.push(`${op} ${val}`)
        }
      }
    }
    const inner = innerParts.join(' ')
    const wrapped = `if(${condField} ${condOp} ${condValue}, ${inner}, ${condElse})`

    // Replace first selected with wrapped, remove the rest
    const firstIdx = sorted[0]!
    next[firstIdx] = { text: wrapped, negated: false }
    for (let i = sorted.length - 1; i > 0; i--) {
      const removeIdx = sorted[i]!
      next.splice(removeIdx, 1)
      if (removeIdx > 0) nextOps.splice(removeIdx - 1, 1)
    }

    rebuild(next, nextOps.slice(0, next.length - 1))
    setSelectedIdxs(new Set([firstIdx]))
    setShowCondition(false)
  }

  const rebuild = (newBlocks: Block[], newOps: BlockOp[]) => {
    onUpdate(blocksToFormula(newBlocks, newOps))
  }

  const toggleNegate = (index: number) => {
    const next = [...blocks]
    next[index] = { ...next[index]!, negated: !next[index]!.negated }
    rebuild(next, ops)
  }

  const changeOp = (index: number, op: BlockOp) => {
    const nextOps = [...ops]
    nextOps[index] = op
    rebuild(blocks, nextOps)
  }

  const removeBlock = (index: number) => {
    const nextBlocks = blocks.filter((_, i) => i !== index)
    const nextOps = [...ops]
    if (index === 0) {
      nextOps.shift()
    } else {
      nextOps.splice(index - 1, 1)
    }
    rebuild(nextBlocks, nextOps)
  }

  const startEdit = (index: number) => {
    setEditIdx(index)
    setEditText(blocks[index]!.text)
  }

  const commitEdit = () => {
    if (editIdx === null) return
    const trimmed = editText.trim()
    if (!trimmed) { setEditIdx(null); return }
    const next = [...blocks]
    next[editIdx] = { text: trimmed, negated: next[editIdx]!.negated }
    rebuild(next, ops)
    setEditIdx(null)
  }

  const addBlock = (text: string, op: BlockOp = '+') => {
    if (!text.trim()) return
    const newBlocks = [...blocks, { text: text.trim(), negated: false }]
    const newOps = [...ops, op]
    rebuild(newBlocks, newOps)
    setShowAdd(false)
    setCustomAdd('')
  }

  const handleDragStart = (index: number) => setDragIdx(index)
  const handleDragOver = (index: number, e: React.DragEvent) => { e.preventDefault(); setDropIdx(index) }
  const handleDragEnd = () => { setDragIdx(null); setDropIdx(null) }
  const handleDrop = (index: number) => {
    if (dragIdx === null || dragIdx === index) { handleDragEnd(); return }
    const nextBlocks = [...blocks]
    const nextOps = [...ops]
    const [movedBlock] = nextBlocks.splice(dragIdx, 1)
    nextBlocks.splice(index, 0, movedBlock!)
    // Reorder ops to match (ops[i] is between block[i] and block[i+1])
    // Simplest: just keep ops as-is since they represent connectors
    // Actually we need to move the op that was "before" the dragged block
    const opIdx = dragIdx > 0 ? dragIdx - 1 : 0
    const [movedOp] = nextOps.splice(opIdx, 1)
    const newOpIdx = index > 0 ? index - 1 : 0
    nextOps.splice(newOpIdx, 0, movedOp ?? '+')
    rebuild(nextBlocks, nextOps)
    handleDragEnd()
  }

  return (
    <div className="formula-blocks">
      {error && (
        <div className="formula-block formula-block-error">
          <span className="formula-block-icon">⚠</span>
          <span className="formula-block-label formula-block-error-text">{error}</span>
        </div>
      )}

      <div className="formula-blocks-toolbar">
        <button
          type="button"
          className={`formula-blocks-multi-btn${multiMode ? ' formula-blocks-multi-btn-active' : ''}`}
          onClick={() => { setMultiMode(!multiMode); if (multiMode) setSelectedIdxs(new Set()) }}
          title={multiMode ? 'Exit multi-select' : 'Select multiple blocks'}
        >
          {multiMode ? '✓ Multi-select' : '☐ Multi-select'}
        </button>
        {selectedIdxs.size > 0 && (
          <button
            type="button"
            className={`formula-blocks-multi-btn${showCondition ? ' formula-blocks-multi-btn-active' : ''}`}
            onClick={() => setShowCondition(!showCondition)}
            title="Wrap selected in a condition"
          >
            ⚡ if()
          </button>
        )}
        {selectedIdxs.size > 1 && (
          <span className="formula-blocks-selection-count">{selectedIdxs.size} selected</span>
        )}
      </div>

      {showCondition && selectedIdxs.size > 0 && (
        <div className="formula-blocks-condition-editor">
          <span className="formula-blocks-cond-label">If</span>
          <select className="sfb-inline" value={condField} onChange={(e) => setCondField(e.target.value)}>
            {Object.keys(FORMULA_FIELDS).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select className="sfb-inline" value={condOp} onChange={(e) => setCondOp(e.target.value)}>
            <option value=">">{'>'}</option>
            <option value=">=">{'>='}</option>
            <option value="<">{'<'}</option>
            <option value="<=">{'<='}</option>
            <option value="==">{'=='}</option>
            <option value="!=">{'!='}</option>
          </select>
          <input
            className="sfb-inline sfb-num"
            type="number"
            value={condValue}
            onChange={(e) => setCondValue(parseFloat(e.target.value) || 0)}
          />
          <span className="formula-blocks-cond-label">else</span>
          <input
            className="sfb-inline formula-blocks-cond-else"
            type="text"
            value={condElse}
            placeholder="0"
            onChange={(e) => setCondElse(e.target.value)}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={applyCondition}>
            Apply
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
            setCondElse(`if(${condField} ${condOp} ${condValue}, 0, 0)`)
          }}>
            + else if
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCondition(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="formula-blocks-list">
        {blocks.map((block, i) => (
          <div key={i}>
            {/* Block */}
            <div
              className={`formula-block${dragIdx === i ? ' formula-block-dragging' : ''}${dropIdx === i ? ' formula-block-drop-target' : ''}${!parseFormula(block.text).ok ? ' formula-block-invalid' : ''}${selectedIdxs.has(i) ? ' formula-block-selected' : ''}`}
              onClick={(e) => selectBlock(i, e)}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(i, e)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
            >
              <button
                type="button"
                className={`formula-block-sign${block.negated ? ' formula-block-sign-neg' : ''}`}
                onClick={() => toggleNegate(i)}
                title={block.negated ? 'Negated (click to make positive)' : 'Positive (click to negate)'}
              >
                {block.negated ? '−' : '+'}
              </button>
              <span className="formula-block-icon">{CATEGORY_ICONS[blockCategory(block.text)] ?? '🧮'}</span>
              {editIdx === i ? (
                <input
                  className="formula-block-edit"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditIdx(null) }}
                  autoFocus
                />
              ) : (
                <span className="formula-block-label" onClick={() => startEdit(i)} title="Click to edit">
                  {block.text}
                </span>
              )}
              {i < blocks.length - 1 && (
                <button
                  type="button"
                  className="formula-block-op-toggle"
                  onClick={() => {
                    const current = ops[i] ?? '+'
                    const next = OP_OPTIONS[(OP_OPTIONS.indexOf(current) + 1) % OP_OPTIONS.length]!
                    changeOp(i, next)
                  }}
                  title={`Operator after this block: ${ops[i] ?? '+'} (click to cycle)`}
                >
                  {ops[i] ?? '+'}
                </button>
              )}
              <span className="formula-block-drag" title="Drag to reorder">⋮⋮</span>
              <button type="button" className="formula-block-remove" onClick={() => removeBlock(i)} title="Remove">×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add block */}
      {showAdd ? (
        <div className="formula-blocks-add-panel">
          <p className="sidebar-block-title">Add a block</p>
          <div className="formula-blocks-add-grid">
            {ADD_SNIPPETS.filter((s) => s.text).map((s) => (
              <button key={s.text} type="button" className="formula-blocks-add-item" onClick={() => addBlock(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="formula-blocks-add-custom">
            <input
              className="formula-blocks-add-input"
              placeholder="Type custom expression..."
              value={customAdd}
              onChange={(e) => setCustomAdd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && customAdd.trim()) addBlock(customAdd) }}
            />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!customAdd.trim()} onClick={() => addBlock(customAdd)}>Add</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>+ Add block</button>
      )}
    </div>
  )
}
