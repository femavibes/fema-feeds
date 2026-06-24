import type { L1FilterStep } from '@cfb/l1-registry'
import { pushTrace } from '@cfb/l1-registry'
import { collectSearchableText, textContainsAny, type PostSearchField } from '@cfb/core-types'

function collectSearchText(
  post: import('@cfb/core-types').NormalizedPost,
  fields: PostSearchField[],
): string {
  return collectSearchableText(post, fields)
}

export const hashtagIncludeStep: L1FilterStep = {
  id: 'hashtag_include',
  evaluate(ctx) {
    const tags = ctx.config.hashtagInclude ?? []
    if (tags.length === 0) return pushTrace(ctx, 'hashtag_include', 'skip')
    const all = [
      ...ctx.post.facetTags,
      ...ctx.post.hiddenFacetTags,
      ...ctx.post.outlineTags,
    ].map((t) => t.toLowerCase())
    const hit = tags.some((t) => all.includes(t.toLowerCase()))
    return hit
      ? pushTrace(ctx, 'hashtag_include', 'pass', `matched #${tags.find((t) => all.includes(t.toLowerCase()))}`)
      : pushTrace(
          ctx,
          'hashtag_include',
          'fail',
          `post tags [${all.slice(0, 6).join(', ') || 'none'}] — need one of ${tags.join(', ')}`,
        )
  },
}

export const hashtagExcludeStep: L1FilterStep = {
  id: 'hashtag_exclude',
  evaluate(ctx) {
    const tags = ctx.config.hashtagExclude ?? []
    if (tags.length === 0) return pushTrace(ctx, 'hashtag_exclude', 'skip')
    const all = [
      ...ctx.post.facetTags,
      ...ctx.post.hiddenFacetTags,
      ...ctx.post.outlineTags,
    ].map((t) => t.toLowerCase())
    const hit = tags.some((t) => all.includes(t.toLowerCase()))
    const blocked = tags.find((t) => all.includes(t.toLowerCase()))
    return hit
      ? pushTrace(ctx, 'hashtag_exclude', 'fail', `blocked hashtag #${blocked}`)
      : pushTrace(ctx, 'hashtag_exclude', 'pass')
  },
}

export const keywordIncludeStep: L1FilterStep = {
  id: 'keyword_include',
  evaluate(ctx) {
    const cfg = ctx.config.keywordInclude
    if (!cfg || cfg.terms.length === 0) return pushTrace(ctx, 'keyword_include', 'skip')
    const haystack = collectSearchText(ctx.post, cfg.fields)
    const hit = textContainsAny(haystack, cfg.terms, {
      caseSensitive: cfg.caseSensitive,
      wholeWord: cfg.wholeWord,
    })
    const termPreview = cfg.terms.slice(0, 4).join(', ') + (cfg.terms.length > 4 ? '…' : '')
    return hit
      ? pushTrace(ctx, 'keyword_include', 'pass', `matched one of: ${termPreview}`)
      : pushTrace(
          ctx,
          'keyword_include',
          'fail',
          `none of [${termPreview}] in ${cfg.fields.join(', ')}`,
        )
  },
}

export const keywordExcludeStep: L1FilterStep = {
  id: 'keyword_exclude',
  evaluate(ctx) {
    const cfg = ctx.config.keywordExclude
    if (!cfg || cfg.terms.length === 0) return pushTrace(ctx, 'keyword_exclude', 'skip')
    const haystack = collectSearchText(ctx.post, cfg.fields)
    const hit = textContainsAny(haystack, cfg.terms, {
      caseSensitive: cfg.caseSensitive,
      wholeWord: cfg.wholeWord,
    })
    const termPreview = cfg.terms.slice(0, 4).join(', ') + (cfg.terms.length > 4 ? '…' : '')
    return hit
      ? pushTrace(ctx, 'keyword_exclude', 'fail', `blocked term matched: ${termPreview}`)
      : pushTrace(ctx, 'keyword_exclude', 'pass')
  },
}
