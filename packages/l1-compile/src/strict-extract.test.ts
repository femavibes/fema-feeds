import { describe, expect, it } from 'vitest'
import type { FeedConfig, L2RuleGroup } from '@cfb/core-types'
import { compileStrictGate, extractStrictIncludePaths } from './index.js'

describe('extractStrictIncludePaths with logic blocks', () => {
  const blockRoot: L2RuleGroup = {
    type: 'group',
    id: 'block-root',
    logic: 'any',
    children: [
      {
        type: 'keyword',
        id: 'kw-the',
        op: 'includes',
        terms: ['the'],
        fields: ['text'],
      },
    ],
  }

  const feed: FeedConfig = {
    feedId: 'logic-block-discovery-feed',
    projectId: 'logic-block-discovery',
    name: 'Logic block discovery',
    enabled: true,
    poolScope: 'project_only',
    match: {
      type: 'group',
      id: 'root',
      logic: 'any',
      children: [
        {
          type: 'logic_block_ref',
          id: 'logic-ref',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          label: 'Discovery block',
        },
      ],
    },
  }

  it('extracts keyword paths from a resolved logic block', () => {
    const resolver = () => blockRoot
    const paths = extractStrictIncludePaths(feed, resolver)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths[0]?.some((b) => b.type === 'keyword' && b.terms.includes('the'))).toBe(true)
  })

  it('returns no paths when logic block resolver is missing', () => {
    expect(extractStrictIncludePaths(feed)).toEqual([])
  })

  it('compileStrictGate includes logic-block feeds in contributingFeeds', () => {
    const project = {
      projectId: 'logic-block-discovery',
      name: 'Logic block discovery',
      enabled: true,
      prefilterMode: 'strict' as const,
      prefilter: { match: { type: 'group' as const, id: 'pf', logic: 'any' as const, children: [] } },
    }
    const result = compileStrictGate(project, [feed], () => blockRoot)
    expect(result.strictGateMeta.pathCount).toBeGreaterThan(0)
    expect(result.strictGateMeta.contributingFeeds).toContain('logic-block-discovery-feed')
    expect(result.strictIncludeGate.includeBranches.some((b) => b.type === 'keyword')).toBe(true)
  })

  it('extracts paths from nested block roots with stale canvas layout', () => {
    const nestedBlock: L2RuleGroup = {
      type: 'group',
      id: 'block-root',
      logic: 'all',
      children: [
        {
          type: 'keyword',
          id: 'kw-urban',
          op: 'includes',
          terms: ['urbanism'],
          fields: ['text'],
        },
      ],
    }
    const resolver = () => nestedBlock
    const paths = extractStrictIncludePaths(feed, resolver)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths[0]?.some((b) => b.type === 'keyword' && b.terms.includes('urbanism'))).toBe(true)
  })
})
