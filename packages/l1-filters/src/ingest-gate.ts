import type {

  CompiledIngestGate,

  IngestGateBranch,

  IngestGateIncludeRule,

  IngestGateRule,

  L2BoolField,

} from '@cfb/core-types'

import {

  collectSearchableText,
  collectPostUrls,
  labelScopeMatches,

  textContainsAny,

  textMatchesRegex,

} from '@cfb/core-types'

import {
  classifyIngestBranch,
  collectAuthorIncludeBranches,
  ingestCompositeChildren,
  isIngestGateComposite,
} from '@cfb/l1-compile'

import type { L1FilterStep } from '@cfb/l1-registry'

import { pushTrace } from '@cfb/l1-registry'



function embedValue(post: import('@cfb/core-types').NormalizedPost, field: L2BoolField): boolean {

  const map: Record<L2BoolField, keyof typeof post.embed> = {

    has_video: 'hasVideo',

    has_image: 'hasImage',

    has_link_card: 'hasLinkCard',

    has_quote: 'hasQuote',

    has_record: 'hasRecord',

    has_text_only: 'hasTextOnly',

  }

  return post.embed[map[field]]

}



function evalIncludeBranch(

  branch: IngestGateBranch,

  post: import('@cfb/core-types').NormalizedPost,

  extras: {

    followRingDids?: Record<string, string[]>

    authorListDids?: Record<string, string[]>

  },

): boolean {

  switch (branch.type) {

    case 'keyword': {

      if (branch.terms.length === 0) return false

      const haystack = collectSearchableText(post, branch.fields)

      return textContainsAny(haystack, branch.terms, {

        caseSensitive: branch.caseSensitive,

        wholeWord: branch.wholeWord,

      })

    }

    case 'regex': {

      if (!branch.pattern.trim()) return false

      const haystack = collectSearchableText(post, branch.fields)

      return textMatchesRegex(haystack, branch.pattern, branch.caseInsensitive !== false)

    }

    case 'hashtag': {

      if (branch.tags.length === 0) return false

      const all = [

        ...post.facetTags,

        ...post.hiddenFacetTags,

        ...post.outlineTags,

      ].map((t) => t.toLowerCase())

      return branch.tags.some((t) => all.includes(t.toLowerCase()))

    }

    case 'post_kind':

      return branch.kinds.includes(post.postKind)

    case 'language': {

      if (post.langs.length === 0) return branch.unknown === 'include'

      return post.langs.some((l) => branch.allow.includes(l))

    }

    case 'embed': {

      const has = embedValue(post, branch.field)

      return branch.required ? has : !has

    }

    case 'labels': {

      if (branch.values.length === 0) return false

      return labelScopeMatches(post, branch.values, branch.scope)

    }

    case 'follow_ring': {

      const nodeId = branch.sourceNodeId ?? ''

      const ring = new Set(extras.followRingDids?.[nodeId] ?? [])

      return ring.has(post.authorDid)

    }

    case 'author': {

      const dids =

        (branch.listId ? extras.authorListDids?.[branch.listId] : undefined) ??

        branch.dids ??

        []

      const on = dids.includes(post.authorDid)

      return branch.op === 'in_list' ? on : !on

    }

    case 'url': {
      if (branch.patterns.length === 0) return false
      const urls = collectPostUrls(post, branch.sources)
      const match = branch.patterns.some((p) => {
        const pattern = branch.caseSensitive ? p : p.toLowerCase()
        return urls.some((u) => {
          const hay = branch.caseSensitive ? u : u.toLowerCase()
          return hay.includes(pattern)
        })
      })
      return match
    }
    default:

      return false

  }

}



function evalPathBranch(

  branch: IngestGateBranch,

  post: import('@cfb/core-types').NormalizedPost,

  extras: {

    followRingDids?: Record<string, string[]>

    authorListDids?: Record<string, string[]>

  },

): boolean {

  if (classifyIngestBranch(branch) === 'exclude') {

    return !evalExcludeBranch(branch, post, extras)

  }

  return evalIncludeBranch(branch, post, extras)

}



function evalIncludeRule(

  rule: IngestGateIncludeRule,

  post: import('@cfb/core-types').NormalizedPost,

  extras: {

    followRingDids?: Record<string, string[]>

    authorListDids?: Record<string, string[]>

  },

): boolean {

  if (!isIngestGateComposite(rule)) {

    return evalPathBranch(rule, post, extras)

  }



  const children = ingestCompositeChildren(rule)

  if (children.length === 0) {
    switch (rule.type) {
      case 'all':
      case 'none':
        return true
      default:
        return false
    }
  }

  switch (rule.type) {
    case 'all':
      for (const child of children) {
        if (!evalIncludeRule(child, post, extras)) return false
      }
      return true
    case 'any':
      for (const child of children) {
        if (evalIncludeRule(child, post, extras)) return true
      }
      return false
    case 'none':
      for (const child of children) {
        if (evalIncludeRule(child, post, extras)) return false
      }
      return true
    case 'n_of': {
      const need = Math.max(1, rule.minPass ?? 2)
      let pass = 0
      for (const child of children) {
        if (evalIncludeRule(child, post, extras)) {
          pass++
          if (pass >= need) return true
        }
      }
      return false
    }
    default:
      return false
  }
}



function postOnCompiledAuthorList(

  post: import('@cfb/core-types').NormalizedPost,

  gate: CompiledIngestGate,

  extras: {

    followRingDids?: Record<string, string[]>

    authorListDids?: Record<string, string[]>

  },

): boolean {

  for (const branch of collectAuthorIncludeBranches(gate.includeBranches)) {

    if (evalIncludeBranch(branch, post, extras)) return true

  }

  return false

}



function evalExcludeBranch(

  branch: IngestGateBranch,

  post: import('@cfb/core-types').NormalizedPost,

  extras: {

    followRingDids?: Record<string, string[]>

    authorListDids?: Record<string, string[]>

  },

): boolean {

  if (branch.type === 'follow_ring' || branch.type === 'author') {

    return evalIncludeBranch(branch, post, extras)

  }

  if (branch.type === 'keyword' || branch.type === 'regex' || branch.type === 'hashtag' || branch.type === 'url') {

    return evalIncludeBranch({ ...branch, op: 'includes' } as IngestGateBranch, post, extras)

  }

  if (branch.type === 'labels') {

    return evalIncludeBranch({ ...branch, op: 'includes' }, post, extras)

  }

  return false

}



export const ingestGateStep: L1FilterStep = {

  id: 'ingest_gate',

  evaluate(ctx) {

    const gate = ctx.config.ingestGate

    if (!gate) return pushTrace(ctx, 'ingest_gate', 'skip')



    const extras = ctx.ingestGateExtras ?? {}

    const hasDiscovery = gate.includeBranches.length > 0

    // 1. Authors only — cheap DID check; only when discovery paths exist.
    if (ctx.config.authorsOnly && hasDiscovery && !postOnCompiledAuthorList(ctx.post, gate, extras)) {
      return pushTrace(ctx, 'ingest_gate', 'fail', 'authors only — author not on a compiled list')
    }

    // 2. Project requirements (cheap-first at compile time).
    for (const branch of gate.restrictBranches ?? []) {
      if (!evalIncludeBranch(branch, ctx.post, extras)) {
        return pushTrace(ctx, 'ingest_gate', 'fail', `restrict ${branch.type} not satisfied`)
      }
    }

    // 3. Project blocks (cheap-first at compile time).
    for (const branch of gate.excludeBranches) {
      if (evalExcludeBranch(branch, ctx.post, extras)) {
        return pushTrace(ctx, 'ingest_gate', 'fail', `exclude ${branch.type} matched`)
      }
    }

    if (!hasDiscovery) {
      return pushTrace(ctx, 'ingest_gate', 'pass', 'no ingest branches — permissive pool')
    }

    // 4. Discovery OR across feeds.
    for (const rule of gate.includeBranches) {
      if (evalIncludeRule(rule, ctx.post, extras)) {
        const label = isIngestGateComposite(rule) ? rule.type : rule.type
        return pushTrace(ctx, 'ingest_gate', 'pass', `matched ${label}`)
      }
    }

    return pushTrace(ctx, 'ingest_gate', 'fail', 'no ingest branch matched')

  },

}

/**
 * Evaluate a compiled ingest gate against a post without project context.
 * Returns true if the post passes (is allowed), false if rejected.
 */
export function evaluateIngestGate(
  gate: CompiledIngestGate,
  post: import('@cfb/core-types').NormalizedPost,
  extras?: { followRingDids?: Record<string, string[]>; authorListDids?: Record<string, string[]> },
): boolean {
  const ex = extras ?? {}

  for (const branch of gate.restrictBranches ?? []) {
    if (!evalIncludeBranch(branch, post, ex)) return false
  }

  for (const branch of gate.excludeBranches) {
    if (evalExcludeBranch(branch, post, ex)) return false
  }

  if (gate.includeBranches.length === 0) return true

  for (const rule of gate.includeBranches) {
    if (evalIncludeRule(rule, post, ex)) return true
  }

  return false
}

