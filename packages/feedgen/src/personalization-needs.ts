import type { L2Expr, NativePersonalizationConfig } from '@cfb/core-types'
import { resolveSuppressServed } from '@cfb/core-types'

const AFFINITY_FIELDS = new Set([
  'feed_affinity',
  'feed_affinity_likes',
  'feed_affinity_reposts',
  'feed_affinity_replies',
  'feed_affinity_quotes',
  'days_since_interaction',
])

const SERVED_HISTORY_FIELDS = new Set([
  'times_served',
  'hours_since_served',
  'was_viewed',
  'times_viewed',
  'hours_since_viewed',
  'times_seen',
  'hours_since_seen',
])

export interface PersonalizationDataNeeds {
  follows: boolean
  /** Load viewer follower list (getFollowers) — for is_follower and/or is_mutual. */
  followers: boolean
  mutuals: boolean
  affinity: boolean
  servedHistory: boolean
  lastOpen: boolean
  /** Hours of serve history to load when servedHistory is true. */
  servedWindowHours: number
}

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

/** Which viewer data sources a feed's personalization config actually uses. */
export function analyzePersonalizationNeeds(
  config: NativePersonalizationConfig,
): PersonalizationDataNeeds {
  const suppressServed = resolveSuppressServed(config)
  let follows = Boolean(config.boostFollowed?.enabled)
  let followers = false
  let mutuals = Boolean(config.boostMutuals?.enabled)
  let affinity = Boolean(config.affinityBoost?.enabled)
  let servedHistory = Boolean(suppressServed?.enabled)
  let lastOpen = false
  let servedWindowHours = Math.max(1, suppressServed?.windowHours ?? 48)

  if (config.formulaEnabled && config.formula) {
    follows ||= formulaUsesField(config.formula, 'is_followed')
    followers ||= formulaUsesField(config.formula, 'is_follower')
    mutuals ||= formulaUsesField(config.formula, 'is_mutual')
    affinity ||= formulaUsesAnyField(config.formula, AFFINITY_FIELDS)
    servedHistory ||= formulaUsesAnyField(config.formula, SERVED_HISTORY_FIELDS)
    lastOpen ||= formulaUsesField(config.formula, 'hours_since_last_open')
    if (formulaUsesAnyField(config.formula, new Set(['hours_since_viewed', 'was_viewed']))) {
      servedWindowHours = Math.max(servedWindowHours, 48)
    }
  }

  if (mutuals) {
    follows = true
    followers = true
  }

  return {
    follows,
    followers,
    mutuals,
    affinity,
    servedHistory,
    lastOpen,
    servedWindowHours,
  }
}

export function personalizationNeedsMutuals(config: NativePersonalizationConfig): boolean {
  return analyzePersonalizationNeeds(config).mutuals
}

export function personalizationNeedsAffinity(config: NativePersonalizationConfig): boolean {
  return analyzePersonalizationNeeds(config).affinity
}
