import type {
  L2AltTextCondition,
  L2AuthorCondition,
  L2BoolCondition,
  L2CompareCondition,
  L2EvalInput,
  L2HashtagCondition,
  L2KeywordCondition,
  L2LabelsCondition,
  L2LanguageCondition,
  L2MentionCondition,
  L2FollowRingCondition,
  L2MediaTypeCondition,
  L2MimeTypeCondition,
  L2MediaStatsCondition,
  L2NodeTrace,
  L2PostAgeCondition,
  L2PostKindCondition,
  L2RegexCondition,
  L2RuleGroup,
  L2RuleNode,
  L2TextCondition,
  L2UrlCondition,
} from '@cfb/core-types'
import {
  DEFAULT_URL_SOURCES,
  isViewerFollowRing,
  formatFollowRingDirection,
  labelScopeMatches,
  collectPostUrls,
  collectSearchableText,
  textContainsAny,
  textMatchesRegex,
  urlMatchesAny,
} from '@cfb/core-types'
import type { L2RuntimeContext } from './context.js'
import { numericFieldValue, postAgeHoursForUse } from './context.js'
import { compareNumbers, evalExpr } from './expr.js'
import { collectEmbedMimeTypes } from '@cfb/post-normalize'

function trace(
  traces: L2NodeTrace[],
  node: L2RuleNode,
  outcome: L2NodeTrace['outcome'],
  detail?: string,
): boolean {
  traces.push({ nodeId: node.id, nodeType: node.type, outcome, detail })
  return outcome === 'pass'
}

function evalText(node: L2TextCondition, ctx: L2RuntimeContext): boolean {
  const hay = node.caseInsensitive !== false ? ctx.post.text.toLowerCase() : ctx.post.text
  const needle = node.caseInsensitive !== false ? node.value.toLowerCase() : node.value
  switch (node.op) {
    case 'contains':
      return hay.includes(needle)
    case 'not_contains':
      return !hay.includes(needle)
    case 'equals':
      return hay === needle
    case 'regex':
      if (!node.value.trim()) return true
      try {
        const flags = node.caseInsensitive !== false ? 'i' : ''
        return new RegExp(node.value, flags).test(ctx.post.text)
      } catch {
        return false
      }
  }
}

function evalLanguage(node: L2LanguageCondition, ctx: L2RuntimeContext): boolean {
  if (node.allow.length === 0) return false
  if (ctx.post.langs.length === 0) {
    return node.unknown === 'include'
  }
  const allow = new Set(node.allow.map((l) => l.toLowerCase()))
  return ctx.post.langs.some((l) => allow.has(l.toLowerCase()))
}

function evalPostKind(node: L2PostKindCondition, ctx: L2RuntimeContext): boolean {
  if (node.kinds.length === 0) return false
  const hit = node.kinds.includes(ctx.post.postKind)
  return node.op === 'is' ? hit : !hit
}

function evalBool(node: L2BoolCondition, ctx: L2RuntimeContext): boolean {
  const actual = ctx.post.embed[node.field === 'has_video' ? 'hasVideo'
    : node.field === 'has_image' ? 'hasImage'
    : node.field === 'has_link_card' ? 'hasLinkCard'
    : node.field === 'has_quote' ? 'hasQuote'
    : node.field === 'has_record' ? 'hasRecord'
    : 'hasTextOnly']
  return actual === node.value
}

function evalLabels(node: L2LabelsCondition, ctx: L2RuntimeContext): boolean {
  const hit = labelScopeMatches(ctx.post, node.values, node.scope, node.labelerDids)
  return node.op === 'includes' ? hit : !hit
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase()
}

function postHashtagSet(post: L2RuntimeContext['post']): Set<string> {
  const all = [
    ...post.facetTags,
    ...post.hiddenFacetTags,
    ...post.outlineTags,
  ]
  return new Set(all.map(normalizeTag).filter(Boolean))
}

function evalHashtag(node: L2HashtagCondition, ctx: L2RuntimeContext): boolean {
  const wanted = node.tags.map(normalizeTag).filter(Boolean)
  if (wanted.length === 0) {
    return node.op === 'includes'
  }
  const tags = postHashtagSet(ctx.post)
  const hit = wanted.some((t) => tags.has(t))
  return node.op === 'includes' ? hit : !hit
}

function evalUrl(node: L2UrlCondition, ctx: L2RuntimeContext): boolean {
  const patterns = node.patterns.map((t) => t.trim()).filter(Boolean)
  if (patterns.length === 0) {
    return node.op === 'includes'
  }
  const sources = node.sources.length > 0 ? node.sources : DEFAULT_URL_SOURCES
  const urls = collectPostUrls(ctx.post, sources)
  const hit = urlMatchesAny(urls, patterns, { caseSensitive: node.caseSensitive })
  return node.op === 'includes' ? hit : !hit
}

function evalKeyword(node: L2KeywordCondition, ctx: L2RuntimeContext): boolean {
  const terms = node.terms.map((t) => t.trim()).filter(Boolean)
  if (terms.length === 0) {
    return node.op === 'includes'
  }
  const fields = node.fields.length > 0 ? node.fields : (['text'] as const)
  const haystack = collectSearchableText(ctx.post, [...fields])
  const hit = textContainsAny(haystack, terms, {
    caseSensitive: node.caseSensitive,
    wholeWord: node.wholeWord,
  })
  return node.op === 'includes' ? hit : !hit
}

function evalRegex(node: L2RegexCondition, ctx: L2RuntimeContext): boolean {
  const pattern = node.pattern.trim()
  if (!pattern) {
    return true
  }
  const fields = node.fields.length > 0 ? node.fields : (['text'] as const)
  const haystack = collectSearchableText(ctx.post, [...fields])
  const hit = textMatchesRegex(haystack, pattern, node.caseInsensitive !== false)
  return node.op === 'matches' ? hit : !hit
}

function evalAuthor(
  node: L2AuthorCondition,
  ctx: L2RuntimeContext,
  input: L2EvalInput,
): { ok: boolean; detail: string } {
  const manual = new Set(node.dids ?? [])
  const fromList = (node.listId && input.authorLists?.[node.listId]) ?? []
  const authorDid = ctx.post.authorDid
  const inManual = manual.has(authorDid)
  const inList = fromList.includes(authorDid)
  const on = inManual || inList
  const ok = node.op === 'in_list' ? on : !on

  const shortDid = authorDid.length > 24 ? `${authorDid.slice(0, 22)}…` : authorDid

  if (node.op === 'in_list') {
    if (on) {
      const via: string[] = []
      if (inList && node.listId) {
        via.push(`list "${node.listId}" (${fromList.length} cached)`)
      }
      if (inManual) via.push(`${manual.size} manual DID(s)`)
      return { ok, detail: `${shortDid} matched via ${via.join(' + ')}` }
    }
    const expected: string[] = []
    if (node.listId) {
      expected.push(`list "${node.listId}" (${fromList.length} cached)`)
    }
    if (manual.size) expected.push(`${manual.size} manual DID(s)`)
    return {
      ok,
      detail: `${shortDid} not in ${expected.join(' + ') || 'any configured source'}`,
    }
  }

  if (!on) {
    return { ok, detail: `${shortDid} not on list (not_in_list passes)` }
  }
  const via: string[] = []
  if (inList && node.listId) via.push(`list "${node.listId}"`)
  if (inManual) via.push('manual DID')
  return { ok, detail: `${shortDid} on ${via.join(' + ')} (not_in_list fails)` }
}

function evalMention(
  node: L2MentionCondition,
  ctx: L2RuntimeContext,
  input: L2EvalInput,
): { ok: boolean; detail: string } {
  const legacy = node as L2MentionCondition & {
    dids?: string[]
    listId?: string
    op?: string
  }
  const legacyOp = (legacy as { op?: string }).op
  const op: 'includes' | 'excludes' =
    legacyOp === 'in_list'
      ? 'includes'
      : legacyOp === 'not_in_list'
        ? 'excludes'
        : node.op
  const resolved = input.mentionDids?.[node.id]
  const wanted = new Set(
    resolved ??
      [
        ...(node.accounts ?? legacy.dids ?? []).filter((a) => a.trim().startsWith('did:')),
      ],
  )
  const mentioned = ctx.post.facetMentions
  const hit = mentioned.some((did) => wanted.has(did))
  const ok = op === 'includes' ? hit : !hit

  if (op === 'includes') {
    if (ok) {
      const matched = mentioned.filter((did) => wanted.has(did))
      const short = matched
        .slice(0, 2)
        .map((d) => (d.length > 24 ? `${d.slice(0, 22)}…` : d))
        .join(', ')
      return { ok, detail: `mentioned ${short}${matched.length > 2 ? '…' : ''}` }
    }
    const count = wanted.size
    return {
      ok,
      detail: count > 0 ? `no facet mention of ${count} account(s)` : 'mention accounts empty',
    }
  }

  if (ok) return { ok, detail: 'no blocked mentions' }
  const blocked = mentioned.filter((did) => wanted.has(did))
  const short = blocked
    .slice(0, 2)
    .map((d) => (d.length > 24 ? `${d.slice(0, 22)}…` : d))
    .join(', ')
  return { ok, detail: `blocked mention ${short}` }
}

function evalFollowRing(
  node: L2FollowRingCondition,
  ctx: L2RuntimeContext,
  input: L2EvalInput,
): { ok: boolean; detail: string } {
  if (isViewerFollowRing(node.hubSource)) {
    return { ok: true, detail: 'viewer ring — applied at skeleton serve' }
  }

  const legacyOp = String((node as { op?: string }).op ?? node.op)
  const op: 'includes' | 'excludes' =
    legacyOp === 'in' || legacyOp === 'in_list'
      ? 'includes'
      : legacyOp === 'not_in' || legacyOp === 'not_in_list'
        ? 'excludes'
        : node.op

  const ring = new Set(input.followRings?.[node.id] ?? [])
  const authorDid = ctx.post.authorDid
  const on = ring.has(authorDid)
  const ok = op === 'includes' ? on : !on

  const shortDid = authorDid.length > 24 ? `${authorDid.slice(0, 22)}…` : authorDid
  const hub = (node.hub ?? '').trim() || 'hub'
  const dir = formatFollowRingDirection(node.direction)

  if (op === 'includes') {
    if (ok) {
      return { ok, detail: `${shortDid} in ${hub} ${dir} (${ring.size} cached)` }
    }
    return {
      ok,
      detail:
        ring.size > 0
          ? `${shortDid} not in ${hub} ${dir} (${ring.size} cached)`
          : `follow ring empty — sync hub ${hub}`,
    }
  }

  if (ok) return { ok, detail: `${shortDid} not in blocked ${hub} ${dir}` }
  return { ok, detail: `${shortDid} in ${hub} ${dir} (excludes fails)` }
}

function evalCompare(node: L2CompareCondition, ctx: L2RuntimeContext): boolean {
  const left = evalExpr(ctx, node.left)
  const right = evalExpr(ctx, node.right)
  return compareNumbers(left, node.op, right)
}

function evalMediaType(node: L2MediaTypeCondition, ctx: L2RuntimeContext): boolean {
  if (node.mediaTypes.length === 0) return node.op === 'is_not'
  const hit = node.mediaTypes.includes(ctx.rankSnapshot.mediaType)
  return node.op === 'is' ? hit : !hit
}

function evalAltText(node: L2AltTextCondition, ctx: L2RuntimeContext): boolean {
  const alt = ctx.rankSnapshot.hasAltText
  if (alt === null) return true
  return node.op === 'has' ? alt : !alt
}

function evalPostAge(node: L2PostAgeCondition, ctx: L2RuntimeContext): boolean {
  const age = postAgeHoursForUse(ctx, node.use)
  if (node.op === 'newer_than') return age <= node.hours
  return age >= node.hours
}

function evalMediaStats(node: L2MediaStatsCondition, ctx: L2RuntimeContext): boolean {
  const actual = numericFieldValue(ctx, node.metric)
  return compareNumbers(actual, node.op, node.value)
}

function evalMimeType(node: L2MimeTypeCondition, ctx: L2RuntimeContext): boolean {
  const pattern = node.pattern.trim().toLowerCase()
  if (!pattern) return node.op === 'excludes'
  const mimes = collectEmbedMimeTypes(ctx.post)
  const hit = mimes.some((mime) => mime.includes(pattern))
  return node.op === 'includes' ? hit : !hit
}

export function evalRuleNode(
  node: L2RuleNode,
  ctx: L2RuntimeContext,
  input: L2EvalInput,
  traces: L2NodeTrace[],
): boolean {
  if (node.type === 'group') {
    return evalGroup(node, ctx, input, traces)
  }

  let ok = false
  let detail: string | undefined

  switch (node.type) {
    case 'text':
      ok = evalText(node, ctx)
      detail = ok ? undefined : `text ${node.op} "${node.value}"`
      break
    case 'keyword':
      ok = evalKeyword(node, ctx)
      detail = ok ? undefined : `keyword ${node.op} ${node.terms.join(',')}`
      break
    case 'regex':
      ok = evalRegex(node, ctx)
      detail = ok ? undefined : `regex ${node.op} /${node.pattern}/`
      break
    case 'bool':
      ok = evalBool(node, ctx)
      detail = ok ? undefined : `${node.field} !== ${node.value}`
      break
    case 'language':
      ok = evalLanguage(node, ctx)
      detail = ok
        ? undefined
        : `langs ${ctx.post.langs.join(',') || '(none)'} vs allow ${node.allow.join(',')}`
      break
    case 'post_kind':
      ok = evalPostKind(node, ctx)
      detail = ok ? undefined : `post kind ${ctx.post.postKind}`
      break
    case 'labels':
      ok = evalLabels(node, ctx)
      detail = ok ? undefined : `labels ${node.op} ${node.values.join(',')}`
      break
    case 'hashtag':
      ok = evalHashtag(node, ctx)
      detail = ok ? undefined : `hashtag ${node.op} ${node.tags.join(',')}`
      break
    case 'url':
      ok = evalUrl(node, ctx)
      detail = ok ? undefined : `url ${node.op} ${node.patterns.join(',')}`
      break
    case 'mention': {
      const mention = evalMention(node, ctx, input)
      ok = mention.ok
      detail = mention.detail
      break
    }
    case 'follow_ring': {
      const ring = evalFollowRing(node, ctx, input)
      ok = ring.ok
      detail = ring.detail
      break
    }
    case 'media_type':
      ok = evalMediaType(node, ctx)
      detail = ok ? undefined : `media type ${node.op} ${node.mediaTypes.join(',')}`
      break
    case 'alt_text':
      ok = evalAltText(node, ctx)
      detail = ok ? undefined : `alt text ${node.op}`
      break
    case 'post_age': {
      const age = postAgeHoursForUse(ctx, node.use)
      ok = evalPostAge(node, ctx)
      detail = ok ? undefined : `post age ${age.toFixed(1)}h ${node.op} ${node.hours}h`
      break
    }
    case 'media_stats': {
      const actual = numericFieldValue(ctx, node.metric)
      ok = evalMediaStats(node, ctx)
      detail = ok ? undefined : `${node.metric} ${actual} ${node.op} ${node.value} failed`
      break
    }
    case 'mime_type':
      ok = evalMimeType(node, ctx)
      detail = ok ? undefined : `mime ${node.op} ${node.pattern}`
      break
    case 'author': {
      const author = evalAuthor(node, ctx, input)
      ok = author.ok
      detail = author.detail
      break
    }
    case 'compare': {
      const left = evalExpr(ctx, node.left)
      const right = evalExpr(ctx, node.right)
      ok = compareNumbers(left, node.op, right)
      detail = ok ? undefined : `${left} ${node.op} ${right} failed`
      break
    }
    case 'graze_stub':
      ok = true
      detail = `Graze ${node.grazeType} (not evaluated yet)`
      traces.push({
        nodeId: node.id,
        nodeType: node.type,
        outcome: 'skip',
        detail,
      })
      return ok
    case 'logic_block_ref': {
      const resolver = input.resolveLogicBlock
      const resolved = resolver?.({
        packageId: node.packageId,
        versionPin: node.versionPin,
      })
      if (!resolved) {
        ok = false
        detail = `logic block ${node.label ?? node.packageId}@${node.versionPin} not found`
        trace(traces, node, 'fail', detail)
        return false
      }
      ok = evalRuleNode(resolved, ctx, input, traces)
      detail = ok
        ? undefined
        : `logic block ${node.label ?? node.packageId} did not match`
      trace(traces, node, ok ? 'pass' : 'fail', detail)
      return ok
    }
  }

  trace(traces, node, ok ? 'pass' : 'fail', detail)
  return ok
}

function emptyGroupOutcome(logic: L2RuleGroup['logic']): boolean {
  switch (logic) {
    case 'all':
    case 'none':
      return true
    case 'any':
    case 'n_of':
    default:
      return false
  }
}

function evalGroup(
  group: L2RuleGroup,
  ctx: L2RuntimeContext,
  input: L2EvalInput,
  traces: L2NodeTrace[],
): boolean {
  if (group.children.length === 0) {
    const ok = emptyGroupOutcome(group.logic)
    trace(traces, group, ok ? 'pass' : 'fail', 'empty group')
    return ok
  }

  const results = group.children.map((child) => evalRuleNode(child, ctx, input, traces))

  let ok: boolean
  switch (group.logic) {
    case 'all':
      ok = results.every(Boolean)
      break
    case 'any':
      ok = results.some(Boolean)
      break
    case 'n_of': {
      const need = Math.max(1, group.minPass ?? 2)
      ok = results.filter(Boolean).length >= need
      break
    }
    case 'none':
      ok = !results.some(Boolean)
      break
  }

  const passed = results.filter(Boolean).length
  const detail = ok
    ? `${group.logic}: ${passed}/${results.length} passed`
    : (() => {
        const failed = group.children
          .filter((_, i) => !results[i])
          .map((child) => (child.type === 'group' ? `group(${child.logic})` : child.type))
          .slice(0, 5)
        let msg = `${group.logic}: ${passed}/${results.length} passed`
        if (failed.length) msg += ` — failed: ${failed.join(', ')}`
        return msg
      })()

  trace(traces, group, ok ? 'pass' : 'fail', detail)
  return ok
}
