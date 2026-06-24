import type pg from 'pg'
import { getPluginWasmArtifact } from '@cfb/storage-postgres'
import type { PluginPackage } from '@cfb/core-types'

export async function wasmArtifactForPlugin(
  pool: pg.Pool,
  pkg: PluginPackage,
  versionPin: string,
): Promise<{ wasmBytes: Uint8Array; wasmSha256: string } | undefined> {
  if (pkg.runtime !== 'wasm' && pkg.runtime !== 'worker') return undefined
  const artifact = await getPluginWasmArtifact(pool, pkg.id, versionPin)
  if (!artifact) return undefined
  return { wasmBytes: new Uint8Array(artifact.bytes), wasmSha256: artifact.sha256 }
}
