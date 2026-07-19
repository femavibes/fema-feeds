import { describe, expect, it } from 'vitest'
import type { LogicBlockPackage, L2RuleGroup } from '@cfb/core-types'
import {
  applyLogicBlockUpgrades,
  bumpAutoMinorLogicBlockPins,
  isPatchUpgrade,
  manualLogicBlockUpgradeHints,
  resolveLogicBlockVersionPin,
  scanLogicBlockUpgrades,
} from './logic-block-upgrades.js'
import { createFeedLogicBlockResolver } from './logic-blocks.js'

describe('logic-block-upgrades', () => {
  it('detects patch upgrades and resolves auto_minor', () => {
    expect(isPatchUpgrade('1.0.0', '1.0.2')).toBe(true)
    expect(isPatchUpgrade('1.0.0', '1.1.0')).toBe(false)
    expect(resolveLogicBlockVersionPin('1.0.0', '1.0.2', 'auto_minor')).toBe('1.0.2')
    expect(resolveLogicBlockVersionPin('1.0.0', '1.1.0', 'auto_minor')).toBe('1.0.0')
    expect(resolveLogicBlockVersionPin('1.0.0', '1.0.2', 'pinned')).toBe('1.0.0')
  })

  it('scans and applies feed logic block version bumps', () => {
    const hints = scanLogicBlockUpgrades(
      [
        {
          nodeId: 'n1',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          label: 'Boost',
          updatePolicy: 'notify',
        },
      ],
      new Map([['pkg-1', { version: '1.0.3', name: 'Boost pack' }]]),
    )
    expect(hints).toHaveLength(1)
    expect(hints[0]?.latestVersion).toBe('1.0.3')

    const next = applyLogicBlockUpgrades(
      {
        type: 'group',
        id: 'root',
        logic: 'all',
        children: [
          {
            type: 'logic_block_ref',
            id: 'n1',
            packageId: 'pkg-1',
            versionPin: '1.0.0',
          },
        ],
      },
      new Map([['n1', '1.0.3']]),
    )
    const ref = next.children[0]
    expect(ref?.type).toBe('logic_block_ref')
    if (ref?.type === 'logic_block_ref') {
      expect(ref.versionPin).toBe('1.0.3')
    }
  })

  it('aliases feed pins to resolved packages for auto_minor eval lookup', () => {
    const inner: L2RuleGroup = {
      type: 'group',
      id: 'inner',
      logic: 'all',
      children: [],
    }
    const pkg = {
      id: 'pkg-1',
      ownerDid: 'did:plc:x',
      slug: 'boost',
      version: '1.0.2',
      name: 'Boost',
      visibility: 'collection',
      trustTier: 'none',
      root: inner,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies LogicBlockPackage

    const resolve = createFeedLogicBlockResolver([pkg], [
      { packageId: 'pkg-1', feedPin: '1.0.0', resolvedPin: '1.0.2' },
    ])

    expect(resolve({ packageId: 'pkg-1', versionPin: '1.0.0' })?.id).toBe('inner')
    expect(resolve({ packageId: 'pkg-1', versionPin: '1.0.2' })?.id).toBe('inner')
    expect(resolve({ packageId: 'pkg-1', versionPin: '9.9.9' })).toBeNull()
  })

  it('bumps auto_minor pins in the feed tree and filters manual upgrade hints', () => {
    const root: L2RuleGroup = {
      type: 'group',
      id: 'root',
      logic: 'all',
      children: [
        {
          type: 'logic_block_ref',
          id: 'auto',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'auto_minor',
        },
        {
          type: 'logic_block_ref',
          id: 'quiet',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'pinned',
        },
        {
          type: 'logic_block_ref',
          id: 'alert',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'notify',
        },
      ],
    }
    const { next, bumpedNodeIds } = bumpAutoMinorLogicBlockPins(
      root,
      new Map([['pkg-1', '1.0.3']]),
    )
    expect(bumpedNodeIds).toEqual(['auto'])
    const auto = next.children[0]
    const quiet = next.children[1]
    const alert = next.children[2]
    expect(auto?.type === 'logic_block_ref' && auto.versionPin).toBe('1.0.3')
    expect(quiet?.type === 'logic_block_ref' && quiet.versionPin).toBe('1.0.0')
    expect(alert?.type === 'logic_block_ref' && alert.versionPin).toBe('1.0.0')

    const hints = scanLogicBlockUpgrades(
      [
        {
          nodeId: 'auto',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'auto_minor',
        },
        {
          nodeId: 'quiet',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'pinned',
        },
        {
          nodeId: 'alert',
          packageId: 'pkg-1',
          versionPin: '1.0.0',
          updatePolicy: 'notify',
        },
      ],
      new Map([['pkg-1', { version: '1.0.3', name: 'Boost' }]]),
    )
    expect(manualLogicBlockUpgradeHints(hints).map((h) => h.nodeId)).toEqual(['alert'])
  })
})
