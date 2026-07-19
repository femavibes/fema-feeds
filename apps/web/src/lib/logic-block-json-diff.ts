/** Stable JSON for diffing (sorted object keys). */
export function stableStringify(value: unknown, space = 2): string {
  return JSON.stringify(sortKeys(value), null, space)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key])
    }
    return out
  }
  return value
}

export type DiffLineKind = 'same' | 'add' | 'remove'

export type DiffLine = {
  kind: DiffLineKind
  text: string
  /** 1-based line in the "from" document when kind is same|remove */
  fromLine?: number
  /** 1-based line in the "to" document when kind is same|add */
  toLine?: number
}

/**
 * Simple line LCS diff — fine for logic-block JSON (usually small).
 * Returns a unified-style sequence of same / remove / add lines.
 */
export function diffLines(fromText: string, toText: string): DiffLine[] {
  const a = fromText.length ? fromText.split('\n') : ['']
  const b = toText.length ? toText.split('\n') : ['']
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? (dp[i + 1]![j + 1]! + 1) : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  let fromLine = 1
  let toLine = 1
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]!, fromLine, toLine })
      i++
      j++
      fromLine++
      toLine++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: 'remove', text: a[i]!, fromLine })
      i++
      fromLine++
    } else {
      out.push({ kind: 'add', text: b[j]!, toLine })
      j++
      toLine++
    }
  }
  while (i < n) {
    out.push({ kind: 'remove', text: a[i]!, fromLine })
    i++
    fromLine++
  }
  while (j < m) {
    out.push({ kind: 'add', text: b[j]!, toLine })
    j++
    toLine++
  }
  return out
}

import type { L2RuleGroup } from '@cfb/core-types'
import { peelLogicBlockEditorShell } from '@cfb/l2-graph'

export function packageRootJson(pkg: {
  id: string
  name: string
  version: string
  root: L2RuleGroup
}): string {
  return stableStringify({
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    root: peelLogicBlockEditorShell(pkg.root),
  })
}
