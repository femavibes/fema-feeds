import type { L2Expr, L2NumericField, L2CompareOp } from '@cfb/core-types'

// --- Config types ---

export type SignalTransform = 'linear' | 'log' | 'sqrt' | 'power' | 'capped'

export interface SignalConfig {
  field: L2NumericField
  enabled: boolean
  weight: number
  transform: SignalTransform
  /** For 'power' transform: exponent (default 0.7) */
  power?: number
  /** For 'capped' transform: max value */
  cap?: number
}

export interface DerivedSignalConfig {
  id: string
  name: string
  /** Numerator fields with weights */
  numerator: Array<{ field: L2NumericField; weight: number }>
  /** Denominator field (for ratio). If null, no division. */
  denominator?: { field: L2NumericField; guard: number }
  /** Applied after ratio */
  transform: SignalTransform
  weight: number
  power?: number
  cap?: number
}

export interface ConditionalConfig {
  id: string
  field: L2NumericField
  op: L2CompareOp
  value: number
  /** Mode: 'add' = add bonus, 'multiply' = multiply score */
  mode: 'add' | 'multiply'
  /** The bonus (add) or factor (multiply) */
  amount: number
}

export type DecayCurve = 'none' | 'exponential' | 'linear' | 'step'

export interface DecayConfig {
  curve: DecayCurve
  halfLifeHours: number
  /** For 'step': full score until this many hours, then drop */
  stepDropHours?: number
  /** Floor: score never decays below this fraction (0-1) */
  floor?: number
}

export interface LimitsConfig {
  scoreCap: number      // 0 = no cap
  scoreFloor: number    // 0 = no floor
  authorFairness: 'off' | 'log' | 'sqrt' | 'divide'
}

export interface SortFormula {
  signals: SignalConfig[]
  derivedSignals: DerivedSignalConfig[]
  conditionals: ConditionalConfig[]
  decay: DecayConfig
  limits: LimitsConfig
}

// --- Default config ---

export const DEFAULT_SORT_FORMULA: SortFormula = {
  signals: [
    { field: 'like_count', enabled: true, weight: 1, transform: 'linear' },
    { field: 'repost_count', enabled: true, weight: 2, transform: 'linear' },
    { field: 'reply_count', enabled: true, weight: 1, transform: 'linear' },
    { field: 'quote_count', enabled: false, weight: 1, transform: 'linear' },
    { field: 'bookmark_count', enabled: false, weight: 3, transform: 'linear' },
    { field: 'author_follower_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'author_posts_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'text_length', enabled: false, weight: 0, transform: 'linear' },
    { field: 'image_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'facet_tag_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'facet_link_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'facet_mention_count', enabled: false, weight: 0, transform: 'linear' },
    { field: 'editor_score', enabled: false, weight: 0, transform: 'linear' },
  ],
  derivedSignals: [],
  conditionals: [],
  decay: { curve: 'none', halfLifeHours: 0 },
  limits: { scoreCap: 0, scoreFloor: 0, authorFairness: 'off' },
}

// --- Compiler: SortFormula → L2Expr ---

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function lit(value: number): L2Expr {
  return { type: 'literal', value }
}

function add(a: L2Expr, b: L2Expr): L2Expr {
  return { type: 'binary', op: '+', left: a, right: b }
}

function mul(a: L2Expr, b: L2Expr): L2Expr {
  return { type: 'binary', op: '*', left: a, right: b }
}

function div(a: L2Expr, b: L2Expr): L2Expr {
  return { type: 'binary', op: '/', left: a, right: b }
}

function applyTransform(expr: L2Expr, config: { transform: SignalTransform; power?: number; cap?: number }): L2Expr {
  switch (config.transform) {
    case 'linear':
      return expr
    case 'log':
      return { type: 'unary', op: 'log', operand: add(expr, lit(1)) }
    case 'sqrt':
      return { type: 'unary', op: 'sqrt', operand: add(expr, lit(1)) }
    case 'power':
      return { type: 'binary', op: '**', left: add(expr, lit(1)), right: lit(config.power ?? 0.7) }
    case 'capped':
      return { type: 'clamp', value: expr, min: lit(0), max: lit(config.cap ?? 500) }
  }
}

function compileSignal(sig: SignalConfig): L2Expr | null {
  if (!sig.enabled || sig.weight === 0) return null
  let expr = applyTransform(fieldExpr(sig.field), sig)
  if (sig.weight !== 1) expr = mul(expr, lit(sig.weight))
  return expr
}

function compileDerivedSignal(ds: DerivedSignalConfig): L2Expr | null {
  if (ds.weight === 0) return null
  // Build numerator: sum of field*weight
  const numParts = ds.numerator.filter((n) => n.weight !== 0)
  if (numParts.length === 0) return null
  let num: L2Expr = numParts.length === 1
    ? (numParts[0]!.weight === 1 ? fieldExpr(numParts[0]!.field) : mul(fieldExpr(numParts[0]!.field), lit(numParts[0]!.weight)))
    : numParts.reduce<L2Expr>((acc, n, i) => {
        const term = n.weight === 1 ? fieldExpr(n.field) : mul(fieldExpr(n.field), lit(n.weight))
        return i === 0 ? term : add(acc, term)
      }, lit(0))

  // Apply denominator (ratio)
  let expr: L2Expr
  if (ds.denominator) {
    expr = { type: 'ratio', numerator: num, denominator: fieldExpr(ds.denominator.field), guard: ds.denominator.guard }
  } else {
    expr = num
  }

  // Apply transform
  expr = applyTransform(expr, ds)

  // Apply weight
  if (ds.weight !== 1) expr = mul(expr, lit(ds.weight))
  return expr
}

function compileConditional(cond: ConditionalConfig, baseExpr: L2Expr): L2Expr {
  const test: L2Expr = { type: 'field', field: cond.field }
  if (cond.mode === 'add') {
    return {
      type: 'cond', op: cond.op,
      left: test, right: lit(cond.value),
      then: add(baseExpr, lit(cond.amount)),
      else: baseExpr,
    }
  }
  // multiply
  return {
    type: 'cond', op: cond.op,
    left: test, right: lit(cond.value),
    then: mul(baseExpr, lit(cond.amount)),
    else: baseExpr,
  }
}

function applyDecay(expr: L2Expr, decay: DecayConfig): L2Expr {
  if (decay.curve === 'none' || decay.halfLifeHours <= 0) return expr
  const age = fieldExpr('post_age_hours')

  switch (decay.curve) {
    case 'exponential':
      // score / (1 + age / halfLife)
      return div(expr, add(lit(1), div(age, lit(decay.halfLifeHours))))
    case 'linear': {
      // score * max(0, 1 - age / (halfLife * 2))
      const factor: L2Expr = { type: 'binary', op: 'max', left: lit(0), right: { type: 'binary', op: '-', left: lit(1), right: div(age, lit(decay.halfLifeHours * 2)) } }
      return mul(expr, factor)
    }
    case 'step': {
      // if age < stepDropHours then score else score * floor
      const dropHours = decay.stepDropHours ?? decay.halfLifeHours
      const floor = decay.floor ?? 0.5
      return {
        type: 'cond', op: '<',
        left: age, right: lit(dropHours),
        then: expr,
        else: mul(expr, lit(floor)),
      }
    }
  }
}

function applyAuthorFairness(expr: L2Expr, mode: LimitsConfig['authorFairness']): L2Expr {
  if (mode === 'off') return expr
  const followers = add(fieldExpr('author_follower_count'), lit(1))
  switch (mode) {
    case 'divide':
      return div(expr, div(followers, lit(1000)))
    case 'log':
      return div(expr, { type: 'unary', op: 'log', operand: followers })
    case 'sqrt':
      return div(expr, { type: 'unary', op: 'sqrt', operand: followers })
  }
}

export function compileSortFormula(formula: SortFormula): L2Expr {
  // 1. Sum all enabled signals
  const signalExprs = formula.signals.map(compileSignal).filter(Boolean) as L2Expr[]
  const derivedExprs = formula.derivedSignals.map(compileDerivedSignal).filter(Boolean) as L2Expr[]
  const allParts = [...signalExprs, ...derivedExprs]

  let expr: L2Expr = allParts.length === 0
    ? lit(0)
    : allParts.reduce<L2Expr>((acc, e, i) => (i === 0 ? e : add(acc, e)), lit(0))

  // 2. Apply conditionals
  for (const cond of formula.conditionals) {
    expr = compileConditional(cond, expr)
  }

  // 3. Apply time decay
  expr = applyDecay(expr, formula.decay)

  // 4. Apply author fairness
  expr = applyAuthorFairness(expr, formula.limits.authorFairness)

  // 5. Apply global limits
  if (formula.limits.scoreCap > 0 || formula.limits.scoreFloor !== 0) {
    const min = lit(formula.limits.scoreFloor)
    const max = formula.limits.scoreCap > 0 ? lit(formula.limits.scoreCap) : lit(999999)
    expr = { type: 'clamp', value: expr, min, max }
  }

  return expr
}

// --- Human-readable label ---

const TRANSFORM_LABELS: Record<SignalTransform, string> = {
  linear: '',
  log: 'log',
  sqrt: '√',
  power: '^',
  capped: 'cap',
}

export function sortFormulaLabel(formula: SortFormula): string {
  const parts: string[] = []
  for (const sig of formula.signals) {
    if (!sig.enabled || sig.weight === 0) continue
    const t = TRANSFORM_LABELS[sig.transform]
    const field = sig.field.replace(/_count$/, '').replace(/_/g, '_')
    const w = sig.weight === 1 ? '' : `×${sig.weight}`
    if (t) {
      parts.push(`${t}(${field})${w}`)
    } else {
      parts.push(`${field}${w}`)
    }
  }
  for (const ds of formula.derivedSignals) {
    if (ds.weight === 0) continue
    parts.push(ds.name)
  }
  if (parts.length === 0) return 'No signals'
  let label = parts.join(' + ')
  if (formula.decay.curve !== 'none') label += ` [${formula.decay.curve} decay ${formula.decay.halfLifeHours}h]`
  if (formula.limits.authorFairness !== 'off') label += ` [${formula.limits.authorFairness} fairness]`
  return label
}
