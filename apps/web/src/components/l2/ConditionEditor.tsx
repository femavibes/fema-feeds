import { useState } from 'react'
import type { L2NumericField, L2CompareOp } from '@cfb/core-types'
import { FORMULA_FIELDS } from '../../lib/formula-parser'

const FIELDS = Object.keys(FORMULA_FIELDS)
const OPS: { value: L2CompareOp; label: string }[] = [
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
]

export type ElseMode = 'value' | 'field' | 'elseif'

export interface ConditionNode {
  field: string
  op: L2CompareOp
  value: number
  elseMode: ElseMode
  elseValue: number
  elseField: string
  elseFieldOp: '+' | '-' | '*' | '/' | 'none'
  elseFieldAmount: number
  elseIf: ConditionNode | null
}

function defaultCondition(): ConditionNode {
  return {
    field: 'likes',
    op: '>',
    value: 100,
    elseMode: 'value',
    elseValue: 0,
    elseField: 'likes',
    elseFieldOp: 'none',
    elseFieldAmount: 1,
    elseIf: null,
  }
}

/** Build formula text from a ConditionNode tree, wrapping the provided "then" expression. */
export function conditionToFormula(node: ConditionNode, thenExpr: string): string {
  const elseExpr = buildElse(node)
  return `if(${node.field} ${node.op} ${node.value}, ${thenExpr}, ${elseExpr})`
}

function buildElse(node: ConditionNode): string {
  switch (node.elseMode) {
    case 'value':
      return String(node.elseValue)
    case 'field':
      if (node.elseFieldOp === 'none') return node.elseField
      return `${node.elseField} ${node.elseFieldOp} ${node.elseFieldAmount}`
    case 'elseif':
      if (!node.elseIf) return '0'
      const nestedThen = node.elseIf.elseFieldOp === 'none'
        ? node.elseIf.field
        : `${node.elseIf.field} ${node.elseIf.elseFieldOp} ${node.elseIf.elseFieldAmount}`
      return conditionToFormula(node.elseIf, nestedThen)
  }
}

interface Props {
  condition: ConditionNode
  onChange: (node: ConditionNode) => void
  thenExpr?: string
  depth?: number
}

export function ConditionEditor({ condition, onChange, thenExpr, depth = 0 }: Props) {
  return (
    <div className={`cond-editor${depth > 0 ? ' cond-editor-nested' : ''}`}>
      {/* Human-readable description */}
      {thenExpr && depth === 0 && (
        <p className="cond-editor-description">
          {describeCondition(condition, thenExpr)}
        </p>
      )}
      {/* Condition row: If field op value */}
      <div className="cond-editor-row">
        <span className="cond-editor-label">If</span>
        <select
          className="cond-editor-select"
          value={condition.field}
          onChange={(e) => onChange({ ...condition, field: e.target.value })}
        >
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          className="cond-editor-select cond-editor-op"
          value={condition.op}
          onChange={(e) => onChange({ ...condition, op: e.target.value as L2CompareOp })}
        >
          {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          className="cond-editor-num"
          type="number"
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: parseFloat(e.target.value) || 0 })}
        />
      </div>

      {/* Else: radio options */}
      <div className="cond-editor-else">
        <span className="cond-editor-label">else</span>
        <div className="cond-editor-else-options">
          {/* Option: number value */}
          <label className="cond-editor-option">
            <input
              type="radio"
              name={`else-mode-${depth}`}
              checked={condition.elseMode === 'value'}
              onChange={() => onChange({ ...condition, elseMode: 'value' })}
            />
            <span>Value:</span>
            <input
              className="cond-editor-num"
              type="number"
              value={condition.elseValue}
              disabled={condition.elseMode !== 'value'}
              onChange={(e) => onChange({ ...condition, elseValue: parseFloat(e.target.value) || 0 })}
            />
          </label>

          {/* Option: field expression */}
          <label className="cond-editor-option">
            <input
              type="radio"
              name={`else-mode-${depth}`}
              checked={condition.elseMode === 'field'}
              onChange={() => onChange({ ...condition, elseMode: 'field' })}
            />
            <span>Field:</span>
            <select
              className="cond-editor-select"
              value={condition.elseField}
              disabled={condition.elseMode !== 'field'}
              onChange={(e) => onChange({ ...condition, elseField: e.target.value })}
            >
              {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select
              className="cond-editor-select cond-editor-op"
              value={condition.elseFieldOp}
              disabled={condition.elseMode !== 'field'}
              onChange={(e) => onChange({ ...condition, elseFieldOp: e.target.value as '+' | '-' | '*' | '/' | 'none' })}
            >
              <option value="none">(raw)</option>
              <option value="+">+</option>
              <option value="-">-</option>
              <option value="*">×</option>
              <option value="/">÷</option>
            </select>
            {condition.elseFieldOp !== 'none' && (
              <input
                className="cond-editor-num"
                type="number"
                step="0.1"
                value={condition.elseFieldAmount}
                disabled={condition.elseMode !== 'field'}
                onChange={(e) => onChange({ ...condition, elseFieldAmount: parseFloat(e.target.value) || 1 })}
              />
            )}
          </label>

          {/* Option: else if (nested) */}
          <label className="cond-editor-option">
            <input
              type="radio"
              name={`else-mode-${depth}`}
              checked={condition.elseMode === 'elseif'}
              onChange={() => onChange({ ...condition, elseMode: 'elseif', elseIf: condition.elseIf ?? defaultCondition() })}
            />
            <span>Else if:</span>
          </label>

          {condition.elseMode === 'elseif' && condition.elseIf && (
            <ConditionEditor
              condition={condition.elseIf}
              onChange={(nested) => onChange({ ...condition, elseIf: nested })}
              depth={depth + 1}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const OP_LABELS: Record<string, string> = {
  '>': 'more than',
  '>=': 'at least',
  '<': 'less than',
  '<=': 'at most',
  '==': 'exactly',
  '!=': 'not',
}

function describeCondition(node: ConditionNode, thenExpr: string): string {
  const fieldName = node.field.replace(/_/g, ' ')
  const opLabel = OP_LABELS[node.op] ?? node.op
  const thenDesc = describeExpr(thenExpr)
  const elseDesc = describeElse(node)
  return `If the post has ${opLabel} ${node.value} ${fieldName}, score it by ${thenDesc}. Otherwise, ${elseDesc}.`
}

function describeExpr(text: string): string {
  // Simple field
  if (FORMULA_FIELDS[text]) return text.replace(/_/g, ' ')
  // field op number
  const match = text.match(/^([a-z_]+)\s*([+\-*/])\s*([0-9.]+)$/)
  if (match) {
    const f = match[1]!.replace(/_/g, ' ')
    const op = match[2] === '*' ? 'times' : match[2] === '/' ? 'divided by' : match[2] === '+' ? 'plus' : 'minus'
    return `${f} ${op} ${match[3]}`
  }
  return text
}

function describeElse(node: ConditionNode): string {
  switch (node.elseMode) {
    case 'value':
      return node.elseValue === 0 ? 'don\u2019t count it' : `use ${node.elseValue}`
    case 'field': {
      if (node.elseFieldOp === 'none') return `score it by ${node.elseField.replace(/_/g, ' ')}`
      const op = node.elseFieldOp === '*' ? 'times' : node.elseFieldOp === '/' ? 'divided by' : node.elseFieldOp === '+' ? 'plus' : 'minus'
      return `score it by ${node.elseField.replace(/_/g, ' ')} ${op} ${node.elseFieldAmount}`
    }
    case 'elseif': {
      if (!node.elseIf) return 'don\u2019t count it'
      const nested = node.elseIf
      const nestedField = nested.field.replace(/_/g, ' ')
      const nestedOp = OP_LABELS[nested.op] ?? nested.op
      const nestedElse = describeElse(nested)
      return `if it has ${nestedOp} ${nested.value} ${nestedField}, score it by ${nested.elseField.replace(/_/g, ' ')}. Otherwise, ${nestedElse}`
    }
  }
}

export { defaultCondition }
