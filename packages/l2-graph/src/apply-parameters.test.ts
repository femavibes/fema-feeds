import { describe, expect, it } from 'vitest'
import type { L2RuleGroup } from '@cfb/core-types'

import {
  applyParametersToMatch,
  collectExcludedNodeIds,
} from './apply-parameters.js'

const andRoot: L2RuleGroup = {
  type: 'group',
  id: 'root',
  logic: 'all',
  children: [
    {
      type: 'parameters',
      id: 'params-1',
      title: 'Options',
      controls: [
        {
          name: 'lang',
          label: 'Language filter',
          type: 'boolean',
          default: true,
          targetNodeIds: ['lang-1'],
        },
        {
          name: 'mode',
          label: 'Mode',
          type: 'enum',
          default: 'normal',
          options: [
            { value: 'relaxed', label: 'Relaxed', targetNodeIds: ['g-relaxed'] },
            { value: 'normal', label: 'Normal', targetNodeIds: ['g-normal'] },
            { value: 'strict', label: 'Strict', targetNodeIds: ['g-strict'] },
          ],
        },
      ],
      values: { lang: true, mode: 'normal' },
    },
    {
      type: 'language',
      id: 'lang-1',
      allow: ['en'],
      unknown: 'exclude',
    },
    {
      type: 'group',
      id: 'g-relaxed',
      logic: 'any',
      children: [{ type: 'keyword', id: 'kw-r', op: 'includes', terms: ['a'], fields: ['text'] }],
    },
    {
      type: 'group',
      id: 'g-normal',
      logic: 'any',
      children: [{ type: 'keyword', id: 'kw-n', op: 'includes', terms: ['b'], fields: ['text'] }],
    },
    {
      type: 'group',
      id: 'g-strict',
      logic: 'any',
      children: [
        { type: 'keyword', id: 'kw-s', op: 'includes', terms: ['c'], fields: ['text'] },
        {
          type: 'group',
          id: 'g-strict-inner',
          logic: 'all',
          children: [{ type: 'hashtag', id: 'tag-s', op: 'includes', tags: ['x'] }],
        },
      ],
    },
  ],
}

describe('applyParametersToMatch', () => {
  it('strips Parameter Nodes and keeps enabled targets', () => {
    const out = applyParametersToMatch(andRoot)
    expect(out.children.some((c) => c.type === 'parameters')).toBe(false)
    expect(out.children.map((c) => c.id)).toEqual(['lang-1', 'g-normal'])
  })

  it('excludes boolean targets when toggle is off', () => {
    const excluded = collectExcludedNodeIds(andRoot, { lang: false, mode: 'normal' })
    expect(excluded.has('lang-1')).toBe(true)
    expect(excluded.has('g-normal')).toBe(false)
    expect(excluded.has('g-relaxed')).toBe(true)
    expect(excluded.has('g-strict')).toBe(true)
  })

  it('enum mode keeps only selected option targets (cascade via group id)', () => {
    const out = applyParametersToMatch(andRoot, { values: { mode: 'strict', lang: true } })
    expect(out.children.map((c) => c.id).sort()).toEqual(['g-strict', 'lang-1'])
    const strict = out.children.find((c) => c.id === 'g-strict')
    expect(strict?.type).toBe('group')
    if (strict?.type === 'group') {
      expect(strict.children.map((c) => c.id)).toEqual(['kw-s', 'g-strict-inner'])
    }
  })

  it('removes empty groups after stripping children', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'p',
          controls: [
            {
              name: 'x',
              label: 'X',
              type: 'boolean',
              default: false,
              targetNodeIds: ['only'],
            },
          ],
        },
        {
          type: 'group',
          id: 'wrapper',
          logic: 'any',
          children: [{ type: 'keyword', id: 'only', op: 'includes', terms: ['z'], fields: ['text'] }],
        },
      ],
    }
    const out = applyParametersToMatch(tree)
    expect(out.children).toEqual([])
  })

  it('ignores Parameter Node ids as exclusion targets', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params-a',
          controls: [
            {
              name: 'x',
              label: 'X',
              type: 'boolean',
              default: false,
              targetNodeIds: ['params-b', 'kw'],
            },
          ],
        },
        {
          type: 'parameters',
          id: 'params-b',
          controls: [{ name: 'y', label: 'Y', type: 'boolean', default: true, targetNodeIds: [] }],
        },
        { type: 'keyword', id: 'kw', op: 'includes', terms: ['z'], fields: ['text'] },
      ],
    }
    const excluded = collectExcludedNodeIds(tree)
    expect(excluded.has('params-b')).toBe(false)
    expect(excluded.has('kw')).toBe(true)
  })

  it('applies boolean property binds (caseSensitive + language allow member)', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params',
          controls: [
            {
              name: 'strict_kw',
              label: 'Strict keyword',
              type: 'boolean',
              default: true,
              bindings: [
                { nodeId: 'kw', kind: 'property', property: 'caseSensitive' },
                { nodeId: 'lang', kind: 'property', property: 'allow', member: 'en' },
              ],
            },
          ],
          values: { strict_kw: true },
        },
        {
          type: 'keyword',
          id: 'kw',
          op: 'includes',
          terms: ['hi'],
          fields: ['text'],
          caseSensitive: false,
        },
        { type: 'language', id: 'lang', allow: ['es'], unknown: 'exclude' },
      ],
    }

    const on = applyParametersToMatch(tree)
    const kwOn = on.children.find((c) => c.id === 'kw')
    const langOn = on.children.find((c) => c.id === 'lang')
    expect(kwOn?.type).toBe('keyword')
    if (kwOn?.type === 'keyword') expect(kwOn.caseSensitive).toBe(true)
    expect(langOn?.type).toBe('language')
    if (langOn?.type === 'language') expect(langOn.allow).toEqual(['es', 'en'])

    const off = applyParametersToMatch(tree, { values: { strict_kw: false } })
    const kwOff = off.children.find((c) => c.id === 'kw')
    const langOff = off.children.find((c) => c.id === 'lang')
    if (kwOff?.type === 'keyword') expect(kwOff.caseSensitive).toBe(false)
    if (langOff?.type === 'language') expect(langOff.allow).toEqual(['es'])
  })

  it('boolean control flips binary match-mode enums (includes ↔ excludes)', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params',
          controls: [
            {
              name: 'kw_mode',
              label: 'Keyword mode',
              type: 'boolean',
              default: true,
              bindings: [{ nodeId: 'kw', kind: 'property', property: 'op' }],
            },
          ],
          values: { kw_mode: true },
        },
        {
          type: 'keyword',
          id: 'kw',
          op: 'excludes',
          terms: ['hi'],
          fields: ['text'],
        },
      ],
    }

    const on = applyParametersToMatch(tree)
    const kwOn = on.children.find((c) => c.id === 'kw')
    expect(kwOn?.type).toBe('keyword')
    if (kwOn?.type === 'keyword') expect(kwOn.op).toBe('includes')

    const off = applyParametersToMatch(tree, { values: { kw_mode: false } })
    const kwOff = off.children.find((c) => c.id === 'kw')
    if (kwOff?.type === 'keyword') expect(kwOff.op).toBe('excludes')
  })

  it('boolean property bind can invert when-on value', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params',
          controls: [
            {
              name: 'strict',
              label: 'Strict',
              type: 'boolean',
              default: true,
              bindings: [
                { nodeId: 'kw', kind: 'property', property: 'caseSensitive', value: false },
              ],
            },
          ],
          values: { strict: true },
        },
        {
          type: 'keyword',
          id: 'kw',
          op: 'includes',
          terms: ['hi'],
          fields: ['text'],
          caseSensitive: true,
        },
      ],
    }

    const on = applyParametersToMatch(tree)
    const kwOn = on.children.find((c) => c.id === 'kw')
    if (kwOn?.type === 'keyword') expect(kwOn.caseSensitive).toBe(false)

    const off = applyParametersToMatch(tree, { values: { strict: false } })
    const kwOff = off.children.find((c) => c.id === 'kw')
    if (kwOff?.type === 'keyword') expect(kwOff.caseSensitive).toBe(true)
  })

  it('enum option can set absolute property values', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params',
          controls: [
            {
              name: 'mode',
              label: 'Mode',
              type: 'enum',
              default: 'include',
              options: [
                {
                  value: 'include',
                  label: 'Include',
                  targetNodeIds: [],
                  bindings: [{ nodeId: 'kw', kind: 'property', property: 'op', value: 'includes' }],
                },
                {
                  value: 'exclude',
                  label: 'Exclude',
                  targetNodeIds: [],
                  bindings: [{ nodeId: 'kw', kind: 'property', property: 'op', value: 'excludes' }],
                },
              ],
            },
          ],
          values: { mode: 'exclude' },
        },
        {
          type: 'keyword',
          id: 'kw',
          op: 'includes',
          terms: ['hi'],
          fields: ['text'],
        },
      ],
    }
    const out = applyParametersToMatch(tree)
    const kw = out.children.find((c) => c.id === 'kw')
    expect(kw?.type).toBe('keyword')
    if (kw?.type === 'keyword') expect(kw.op).toBe('excludes')
  })

  it('toggles keyword search fields via property binds', () => {
    const tree: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'parameters',
          id: 'params',
          controls: [
            {
              name: 'alts',
              label: 'Alts',
              type: 'boolean',
              default: true,
              bindings: [
                { nodeId: 'kw', kind: 'property', property: 'fields', member: 'image_alt' },
                { nodeId: 'kw', kind: 'property', property: 'fields', member: 'video_alt' },
              ],
            },
          ],
          values: { alts: true },
        },
        {
          type: 'keyword',
          id: 'kw',
          op: 'includes',
          terms: ['hi'],
          fields: ['text'],
        },
      ],
    }
    const on = applyParametersToMatch(tree)
    const kwOn = on.children.find((c) => c.id === 'kw')
    expect(kwOn?.type).toBe('keyword')
    if (kwOn?.type === 'keyword') {
      expect(kwOn.fields).toEqual(['text', 'image_alt', 'video_alt'])
    }
    const off = applyParametersToMatch(tree, { values: { alts: false } })
    const kwOff = off.children.find((c) => c.id === 'kw')
    if (kwOff?.type === 'keyword') {
      expect(kwOff.fields).toEqual(['text'])
    }
  })
})
