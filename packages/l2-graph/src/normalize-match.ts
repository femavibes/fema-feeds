import type { L2RuleGroup, L2RuleNode, PostSearchField } from '@cfb/core-types'

const DEFAULT_SEARCH_FIELDS: PostSearchField[] = ['text']
const DEFAULT_URL_SOURCES = ['link_card', 'facet_link', 'bridgy_original'] as const

/** Ensure rule trees from storage/imports always have required array fields. */
export function normalizeRuleNode(node: L2RuleNode): L2RuleNode {
  if (node.type === 'group') {
    return {
      ...node,
      children: (node.children ?? []).map(normalizeRuleNode),
    }
  }

  switch (node.type) {
    case 'keyword':
      return {
        ...node,
        terms: node.terms ?? [],
        fields: node.fields?.length ? node.fields : [...DEFAULT_SEARCH_FIELDS],
      }
    case 'regex':
      return {
        ...node,
        pattern: node.pattern ?? '',
        fields: node.fields?.length ? node.fields : [...DEFAULT_SEARCH_FIELDS],
      }
    case 'hashtag':
      return { ...node, tags: node.tags ?? [] }
    case 'url':
      return {
        ...node,
        patterns: node.patterns ?? [],
        sources: node.sources?.length ? node.sources : [...DEFAULT_URL_SOURCES],
      }
    case 'mention':
      return { ...node, accounts: node.accounts ?? [] }
    case 'language':
      return { ...node, allow: node.allow ?? [] }
    case 'labels':
      return { ...node, values: node.values ?? [] }
    case 'post_kind':
      return { ...node, kinds: node.kinds ?? [] }
    case 'media_type':
      return { ...node, mediaTypes: node.mediaTypes ?? [] }
    default:
      return node
  }
}

export function normalizeRuleGroup(match: L2RuleGroup): L2RuleGroup {
  if (!match || match.type !== 'group') {
    return { type: 'group', id: 'root', logic: 'any', children: [] }
  }
  return normalizeRuleNode(match) as L2RuleGroup
}
