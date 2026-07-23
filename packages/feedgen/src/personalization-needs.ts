import type { L2Expr, NativePersonalizationConfig } from '@cfb/core-types'

const AFFINITY_FIELDS = new Set([
  'feed_affinity',
  'feed_affinity_likes',
  'feed_affinity_reposts',
  'feed_affinity_replies',
  'feed_affinity_quotes',
  'days_since_interaction',
])

function formulaUsesField(formula: L2Expr, field: string): boolean {
  switch (formula.type) {
    case 'field':
      return formula.field === field
    case 'enrichment_field':
      return false
    case 'literal':
      return false
    case 'binary':
      return formulaUsesField(formula.left, field) || formulaUsesField(formula.right, field)
    case 'unary':
      return formulaUsesField(formula.operand, field)
    case 'clamp':
      return (
        formulaUsesField(formula.value, field) ||
        formulaUsesField(formula.min, field) ||
        formulaUsesField(formula.max, field)
      )
    case 'cond':
      return (
        formulaUsesField(formula.left, field) ||
        formulaUsesField(formula.right, field) ||
        formulaUsesField(formula.then, field) ||
        formulaUsesField(formula.else, field)
      )
    case 'ratio':
      return formulaUsesField(formula.numerator, field) || formulaUsesField(formula.denominator, field)
  }
}

function formulaUsesAnyField(formula: L2Expr, fields: Set<string>): boolean {
  switch (formula.type) {
    case 'field':
      return fields.has(formula.field)
    case 'enrichment_field':
      return false
    case 'literal':
      return false
    case 'binary':
      return formulaUsesAnyField(formula.left, fields) || formulaUsesAnyField(formula.right, fields)
    case 'unary':
      return formulaUsesAnyField(formula.operand, fields)
    case 'clamp':
      return (
        formulaUsesAnyField(formula.value, fields) ||
        formulaUsesAnyField(formula.min, fields) ||
        formulaUsesAnyField(formula.max, fields)
      )
    case 'cond':
      return (
        formulaUsesAnyField(formula.left, fields) ||
        formulaUsesAnyField(formula.right, fields) ||
        formulaUsesAnyField(formula.then, fields) ||
        formulaUsesAnyField(formula.else, fields)
      )
    case 'ratio':
      return (
        formulaUsesAnyField(formula.numerator, fields) ||
        formulaUsesAnyField(formula.denominator, fields)
      )
  }
}

export function personalizationNeedsMutuals(config: NativePersonalizationConfig): boolean {
  if (config.boostMutuals?.enabled) return true
  if (config.formulaEnabled && config.formula) {
    return formulaUsesField(config.formula, 'is_mutual')
  }
  return false
}

export function personalizationNeedsAffinity(config: NativePersonalizationConfig): boolean {
  if (config.affinityBoost?.enabled) return true
  if (config.formulaEnabled && config.formula) {
    return formulaUsesAnyField(config.formula, AFFINITY_FIELDS)
  }
  return false
}
