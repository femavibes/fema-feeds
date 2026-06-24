import { describe, expect, it } from 'vitest'
import {
  applyLogicBlockUpgrades,
  isPatchUpgrade,
  resolveLogicBlockVersionPin,
  scanLogicBlockUpgrades,
} from './logic-block-upgrades.js'

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
})
