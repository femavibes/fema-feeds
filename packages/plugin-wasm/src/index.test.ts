import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertWasmArtifactSize, evictWasmCache } from './index.js'

describe('plugin-wasm', () => {
  it('rejects empty wasm', () => {
    expect(() => assertWasmArtifactSize(new Uint8Array())).toThrow(/empty/)
  })

  it('evicts cache keys without throwing', () => {
    evictWasmCache(createHash('sha256').update('test').digest('hex'))
  })
})
