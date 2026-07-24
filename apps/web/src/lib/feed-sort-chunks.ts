import type { AuthorFairnessMode, DecayMode, L2Expr, L2NumericField, SortTuning } from '@cfb/core-types'

function fieldExpr(field: L2NumericField): L2Expr {
  return { type: 'field', field }
}

function literal(value: number): L2Expr {
  return { type: 'literal', value }
}

function binary(op: '+' | '-' | '*' | '/', left: L2Expr, right: L2Expr): L2Expr {
  return { type: 'binary', op, left, right }
}

/** Time decay — divide or multiply score by a function of post_created_hours. */
export function compileDecay(base: L2Expr, mode: DecayMode, halfLifeHours: number): L2Expr {
  if (mode === 'none') return base
  if (mode === 'rate') {
    return binary('/', base, binary('+', fieldExpr('post_created_hours'), literal(1)))
  }
  if (halfLifeHours <= 0) return base
  if (mode === 'exponential') {
    return binary(
      '*',
      base,
      {
        type: 'binary',
        op: '**',
        left: literal(0.5),
        right: binary('/', fieldExpr('post_created_hours'), literal(halfLifeHours)),
      },
    )
  }
  return binary('/', base, binary('+', literal(1), binary('/', fieldExpr('post_created_hours'), literal(halfLifeHours))))
}

export function decayFormulaLabel(mode: DecayMode, halfLifeHours: number): string | null {
  if (mode === 'none') return null
  if (mode === 'rate') return '/ (post_created_hours + 1)'
  if (halfLifeHours <= 0) return null
  if (mode === 'exponential') return `* pow(0.5, post_created_hours / ${halfLifeHours})`
  return `/ (1 + post_created_hours / ${halfLifeHours}h)`
}

export function compileEditorBoost(base: L2Expr, weight: number): L2Expr {
  if (weight <= 0) return base
  return binary('+', base, binary('*', fieldExpr('editor_score'), literal(weight)))
}

export function editorBoostFormulaLabel(weight: number): string | null {
  if (weight <= 0) return null
  return ` + editor_score × ${weight}`
}

export function compileAuthorFairness(base: L2Expr, mode: AuthorFairnessMode): L2Expr {
  if (mode === 'off') return base
  const followers = binary('+', fieldExpr('author_follower_count'), literal(1))
  switch (mode) {
    case 'log':
      return binary('/', base, binary('+', binary('/', followers, literal(1000)), literal(1)))
    case 'sqrt':
      return binary('/', base, binary('+', binary('/', followers, literal(100)), literal(1)))
    case 'sigmoid':
      return binary('/', base, binary('+', binary('/', followers, literal(10)), literal(1)))
  }
}

export function authorFairnessFormulaLabel(mode: AuthorFairnessMode): string | null {
  if (mode === 'off') return null
  switch (mode) {
    case 'log':
      return '/ (followers / 1000 + 1)'
    case 'sqrt':
      return '/ (followers / 100 + 1)'
    case 'sigmoid':
      return '/ (followers / 10 + 1)'
  }
}

/** Shared scoring wrapper: decay → author fairness (editor boost applied before this). */
export function applySharedScoring(base: L2Expr, tuning: SortTuning): L2Expr {
  let expr = compileDecay(base, tuning.decayMode ?? 'none', tuning.decayHalfLifeHours)
  expr = compileAuthorFairness(expr, tuning.authorFairness)
  return expr
}

export function decayAndFairnessSuffix(tuning: SortTuning): string {
  const parts: string[] = []
  const decay = decayFormulaLabel(tuning.decayMode ?? 'none', tuning.decayHalfLifeHours)
  if (decay) parts.push(decay)
  const fairness = authorFairnessFormulaLabel(tuning.authorFairness)
  if (fairness) parts.push(fairness)
  return parts.length ? ` ${parts.join(' ')}` : ''
}

/** @deprecated Use decayAndFairnessSuffix + editorBoostFormulaLabel */
export function sharedScoringFormulaSuffix(tuning: SortTuning): string {
  const editor = editorBoostFormulaLabel(tuning.editorScoreWeight)
  return `${editor ?? ''}${decayAndFairnessSuffix(tuning)}`
}

/** Formula-builder template text for shared chunks. */
export const SORT_FORMULA_CHUNK_TEMPLATES = [
  { name: 'Half-life decay', formula: '(score) / (1 + post_created_hours / 24)' },
  { name: 'Exponential decay', formula: '(score) * pow(0.5, post_created_hours / 24)' },
  { name: 'Engagement rate decay', formula: '(score) / (post_created_hours + 1)' },
  { name: 'Editor score boost', formula: '(score) + editor_score * 100' },
  { name: 'Author fairness (gentle)', formula: '(score) / (followers / 1000 + 1)' },
  { name: 'Author fairness (moderate)', formula: '(score) / (followers / 100 + 1)' },
  { name: 'Author fairness (strong)', formula: '(score) / (followers / 10 + 1)' },
] as const
