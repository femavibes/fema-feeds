/**
 * Minimal Aho-Corasick automaton for multi-pattern substring search.
 * Scans text ONCE and finds all matching patterns simultaneously.
 * O(text_length + matches) regardless of pattern count.
 */

interface TrieNode {
  children: Map<number, TrieNode>
  fail: TrieNode | null
  /** Pattern indices that end at this node. */
  output: number[]
  depth: number
}

function createNode(depth: number): TrieNode {
  return { children: new Map(), fail: null, output: [], depth }
}

export interface AhoCorasickMatch {
  /** Index of the matched pattern in the original patterns array. */
  patternIndex: number
  /** Start position in the haystack. */
  start: number
  /** End position in the haystack (exclusive). */
  end: number
}

export interface AhoCorasickAutomaton {
  /** Search text for all pattern matches. */
  search: (text: string) => AhoCorasickMatch[]
  /** Quick check: does text contain ANY pattern? (short-circuits on first match) */
  hasAny: (text: string) => boolean
  /** Number of patterns in the automaton. */
  patternCount: number
}

/**
 * Build an Aho-Corasick automaton from a list of patterns.
 * Case-insensitive by default (patterns and text are lowercased internally).
 */
export function buildAutomaton(
  patterns: string[],
  options?: { caseSensitive?: boolean },
): AhoCorasickAutomaton {
  const caseSensitive = options?.caseSensitive ?? false
  const root = createNode(0)

  // Build trie
  for (let pi = 0; pi < patterns.length; pi++) {
    const pat = caseSensitive ? patterns[pi]! : patterns[pi]!.toLowerCase()
    let node = root
    for (let i = 0; i < pat.length; i++) {
      const ch = pat.charCodeAt(i)
      let child = node.children.get(ch)
      if (!child) {
        child = createNode(node.depth + 1)
        node.children.set(ch, child)
      }
      node = child
    }
    node.output.push(pi)
  }

  // Build fail links (BFS)
  const queue: TrieNode[] = []
  for (const child of root.children.values()) {
    child.fail = root
    queue.push(child)
  }
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const [ch, child] of current.children) {
      queue.push(child)
      let fail = current.fail
      while (fail && !fail.children.has(ch)) fail = fail.fail
      child.fail = fail ? fail.children.get(ch)! : root
      if (child.fail === child) child.fail = root
      // Merge fail outputs
      if (child.fail.output.length > 0) {
        child.output = [...child.output, ...child.fail.output]
      }
    }
  }

  function search(text: string): AhoCorasickMatch[] {
    const hay = caseSensitive ? text : text.toLowerCase()
    const matches: AhoCorasickMatch[] = []
    let node = root
    for (let i = 0; i < hay.length; i++) {
      const ch = hay.charCodeAt(i)
      while (node !== root && !node.children.has(ch)) node = node.fail!
      node = node.children.get(ch) ?? root
      if (node.output.length > 0) {
        for (const pi of node.output) {
          matches.push({ patternIndex: pi, start: i - node.depth + 1, end: i + 1 })
        }
      }
    }
    return matches
  }

  function hasAny(text: string): boolean {
    const hay = caseSensitive ? text : text.toLowerCase()
    let node = root
    for (let i = 0; i < hay.length; i++) {
      const ch = hay.charCodeAt(i)
      while (node !== root && !node.children.has(ch)) node = node.fail!
      node = node.children.get(ch) ?? root
      if (node.output.length > 0) return true
    }
    return false
  }

  return { search, hasAny, patternCount: patterns.length }
}
