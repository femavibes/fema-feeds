import { describe, expect, it } from 'vitest'
import { countImportableConditions } from './import.js'
import { importGrazeFilter } from './import-graze.js'

describe('importGrazeFilter', () => {
  it('imports nested and/or with mapped leaf nodes', () => {
    const root = importGrazeFilter({
      and: [
        {
          or: [
            {
              social_list: [['did:plc:abc', 'did:plc:def'], 'in'],
            },
            {
              regex_matches: ['text', 'bike|transit', true],
            },
            {
              and: [
                {
                  list_member: [
                    'https://bsky.app/profile/example/lists/abc',
                    'in',
                  ],
                },
                {
                  regex_matches: ['text', 'street|road', true],
                },
              ],
            },
          ],
        },
        {
          entity_matches: ['hashtags', ['urbanism', 'transit']],
        },
      ],
    })

    expect(root).not.toBeNull()
    expect(root!.logic).toBe('all')
    expect(root!.children).toHaveLength(2)

    const orGroup = root!.children[0]
    expect(orGroup?.type).toBe('group')
    if (orGroup?.type === 'group') {
      expect(orGroup.logic).toBe('any')
      expect(orGroup.children).toHaveLength(3)
      const nestedAnd = orGroup.children[2]
      expect(nestedAnd?.type).toBe('group')
      if (nestedAnd?.type === 'group') {
        expect(nestedAnd.logic).toBe('all')
        expect(nestedAnd.children).toHaveLength(2)
      }
    }

    expect(countImportableConditions(root!)).toBeGreaterThanOrEqual(5)
  })

  it('extracts manifest.filter from full Graze feed JSON', () => {
    const root = importGrazeFilter({
      order: 'new',
      manifest: {
        filter: {
          and: [{ regex_matches: ['text', 'urbanism', true] }],
        },
      },
    })

    expect(root?.logic).toBe('all')
    expect(root?.children).toHaveLength(1)
    const leaf = root?.children[0]
    expect(leaf?.type).toBe('regex')
  })

  it('preserves unsupported Graze nodes as stubs', () => {
    const root = importGrazeFilter({
      and: [{ param_compare: [true, '==', false] }],
    })
    const leaf = root?.children[0]
    expect(leaf?.type).toBe('graze_stub')
    if (leaf?.type === 'graze_stub') {
      expect(leaf.grazeType).toBe('param_compare')
    }
  })
})
