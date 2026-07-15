import type { Pool } from 'pg'
import type { Suggestion, IntelligenceConfig, SignalType } from './types.js'
import { loadPoolSignals, loadFirehoseBaseline, getDismissedSignals, getPoolPostCount } from './storage.js'

/**
 * Compute confidence score: log2(poolCount + 1) * lift.
 * Higher = more confident the signal is relevant.
 */
export function computeConfidence(poolCount: number, lift: number): number {
  return Math.log2(poolCount + 1) * lift
}

export interface ComputeSuggestionsOptions {
  projectId: string
  config: IntelligenceConfig
  /** Signals already in the project config (to exclude). */
  alreadyCaptured?: Set<string>
}

/**
 * Compute ranked suggestions for a project.
 * Reads pool signals + firehose baseline from DB, calculates lift, filters, ranks.
 */
export async function computeSuggestions(
  pool: Pool,
  opts: ComputeSuggestionsOptions,
): Promise<Suggestion[]> {
  const { projectId, config, alreadyCaptured } = opts

  const [poolSignals, baseline, dismissed, poolPostCount] = await Promise.all([
    loadPoolSignals(pool, projectId, config.windowDays),
    loadFirehoseBaseline(pool, config.windowDays),
    getDismissedSignals(pool, projectId),
    getPoolPostCount(pool, projectId),
  ])

  if (poolSignals.length === 0 || baseline.totalSampled === 0) return []

  // Build firehose frequency lookup: count / totalSampled
  const firehoseFreq = new Map<string, number>()
  for (const row of baseline.signals) {
    const k = `${row.signalType}\x00${row.value}`
    firehoseFreq.set(k, row.count / baseline.totalSampled)
  }

  const totalPoolPosts = poolPostCount || Math.max(...poolSignals.map((s) => s.count), 1)

  const suggestions: Suggestion[] = []

  for (const signal of poolSignals) {
    // Skip below minimum count
    if (signal.count < config.minPoolCount) continue

    const k = `${signal.signalType}\x00${signal.value}`

    // Skip dismissed
    if (dismissed.has(k)) continue

    // Skip already captured (exact match)
    if (alreadyCaptured?.has(k)) continue

    const poolFreq = signal.count / totalPoolPosts
    const fhFreq = firehoseFreq.get(k) ?? 0

    // Laplace smoothing: if signal absent from firehose, assume 1 occurrence
    // This gives high lift but still differentiates by pool frequency
    const smoothedFhFreq = fhFreq > 0 ? fhFreq : (1 / baseline.totalSampled)
    const lift = poolFreq / smoothedFhFreq

    if (lift < config.minLift) continue

    const confidence = computeConfidence(signal.count, lift)

    suggestions.push({
      signalType: signal.signalType,
      value: signal.value,
      poolCount: signal.count,
      poolFrequency: poolFreq,
      firehoseFrequency: fhFreq,
      lift,
      confidence,
    })
  }

  // Sort by confidence descending
  suggestions.sort((a, b) => b.confidence - a.confidence)

  return suggestions
}

/**
 * Build the "already captured" set from a project config.
 * Reads keywords/hashtags from strictIncludeGate branches + legacy fields.
 * Format: "signalType\x00value"
 */
export function buildAlreadyCapturedSet(project: {
  hashtagInclude?: string[]
  keywordInclude?: { terms: string[] }
  scoutDiscovery?: { scouts?: string[] }
  authorLists?: Array<{ dids?: string[] }>
  strictIncludeGate?: {
    includeBranches?: Array<{ type: string; terms?: string[]; tags?: string[] }>
  }
}): Set<string> {
  const set = new Set<string>()

  // Legacy fields
  if (project.hashtagInclude) {
    for (const tag of project.hashtagInclude) {
      set.add(`hashtag\x00${tag.toLowerCase()}`)
    }
  }
  if (project.keywordInclude?.terms) {
    for (const term of project.keywordInclude.terms) {
      set.add(`ngram\x00${term.toLowerCase()}`)
    }
  }

  // strictIncludeGate branches (current config format)
  if (project.strictIncludeGate?.includeBranches) {
    for (const branch of project.strictIncludeGate.includeBranches) {
      if (branch.type === 'keyword' && branch.terms) {
        for (const term of branch.terms) {
          set.add(`ngram\x00${term.toLowerCase()}`)
        }
      }
      if (branch.type === 'hashtag' && branch.tags) {
        for (const tag of branch.tags) {
          set.add(`hashtag\x00${tag.toLowerCase()}`)
        }
      }
    }
  }

  if (project.scoutDiscovery?.scouts) {
    for (const did of project.scoutDiscovery.scouts) {
      set.add(`mention\x00${did}`)
      set.add(`engaged_account\x00${did}`)
    }
  }

  if (project.authorLists) {
    for (const list of project.authorLists) {
      if (list.dids) {
        for (const did of list.dids) {
          set.add(`mention\x00${did}`)
          set.add(`engaged_account\x00${did}`)
        }
      }
    }
  }

  return set
}
