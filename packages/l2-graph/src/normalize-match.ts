import type { L2RuleGroup, L2RuleNode, PostSearchField } from '@cfb/core-types'
import { migrateMediaNodes } from './migrate-media.js'

const DEFAULT_SEARCH_FIELDS: PostSearchField[] = ['text']
const DEFAULT_URL_SOURCES = ['link_card', 'facet_link', 'bridgy_original'] as const

/** Ensure rule trees from storage/imports always have required array fields. */
export function normalizeRuleNode(node: L2RuleNode): L2RuleNode {
  const migrated = migrateMediaNodes(node)

  if (migrated.type === 'group') {
    return {
      ...migrated,
      children: (migrated.children ?? []).map(normalizeRuleNode),
    }
  }

  switch (migrated.type) {
    case 'keyword':
      return {
        ...migrated,
        terms: migrated.terms ?? [],
        fields: migrated.fields?.length ? migrated.fields : [...DEFAULT_SEARCH_FIELDS],
      }
    case 'regex':
      return {
        ...migrated,
        pattern: migrated.pattern ?? '',
        fields: migrated.fields?.length ? migrated.fields : [...DEFAULT_SEARCH_FIELDS],
      }
    case 'hashtag':
      return { ...migrated, tags: migrated.tags ?? [] }
    case 'url':
      return {
        ...migrated,
        patterns: migrated.patterns ?? [],
        sources: migrated.sources?.length ? migrated.sources : [...DEFAULT_URL_SOURCES],
      }
    case 'mention':
      return { ...migrated, accounts: migrated.accounts ?? [] }
    case 'language':
      return { ...migrated, allow: migrated.allow ?? [] }
    case 'labels':
      return { ...migrated, values: migrated.values ?? [] }
    case 'post_kind':
      return { ...migrated, kinds: migrated.kinds ?? [] }
    case 'media':
      return { ...migrated, kinds: migrated.kinds ?? [] }
    case 'media_type':
      return { ...migrated, mediaTypes: migrated.mediaTypes ?? [] }
    default:
      return migrated
  }
}

export function normalizeRuleGroup(match: L2RuleGroup): L2RuleGroup {
  if (!match || match.type !== 'group') {
    return { type: 'group', id: 'root', logic: 'any', children: [] }
  }
  return normalizeRuleNode(match) as L2RuleGroup
}
