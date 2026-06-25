import type { L2Expr, L2RuleGroup, PluginManifest } from '@cfb/core-types'
import type pg from 'pg'

export async function logicBlockVersionExists(
  pool: pg.Pool,
  packageId: string,
  version: string,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM logic_block_package_versions WHERE package_id = $1 AND version = $2`,
    [packageId, version],
  )
  return Boolean(res.rows[0])
}

export async function insertLogicBlockVersionSnapshot(
  pool: pg.Pool,
  input: {
    packageId: string
    version: string
    root: L2RuleGroup
    visualLayout?: import('@cfb/core-types').L2VisualLayout
    name: string
    description?: string | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO logic_block_package_versions (package_id, version, root_group, visual_layout, name, description)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
     ON CONFLICT (package_id, version) DO UPDATE
       SET root_group = EXCLUDED.root_group,
           visual_layout = EXCLUDED.visual_layout,
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
    [
      input.packageId,
      input.version,
      JSON.stringify(input.root),
      input.visualLayout ? JSON.stringify(input.visualLayout) : null,
      input.name,
      input.description ?? null,
    ],
  )
}

export async function patchLogicBlockVersionMetadata(
  pool: pg.Pool,
  packageId: string,
  version: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  if (input.name === undefined && input.description === undefined) return
  await pool.query(
    `UPDATE logic_block_package_versions
     SET name = COALESCE($3, name),
         description = CASE WHEN $4 THEN $5 ELSE description END
     WHERE package_id = $1 AND version = $2`,
    [
      packageId,
      version,
      input.name?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
    ],
  )
}

export async function sortPackVersionExists(
  pool: pg.Pool,
  packageId: string,
  version: string,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM sort_pack_package_versions WHERE package_id = $1 AND version = $2`,
    [packageId, version],
  )
  return Boolean(res.rows[0])
}

export async function insertSortPackVersionSnapshot(
  pool: pg.Pool,
  input: {
    packageId: string
    version: string
    sortKey: L2Expr
    name: string
    description?: string | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO sort_pack_package_versions (package_id, version, sort_key, name, description)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (package_id, version) DO UPDATE
       SET sort_key = EXCLUDED.sort_key,
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
    [
      input.packageId,
      input.version,
      JSON.stringify(input.sortKey),
      input.name,
      input.description ?? null,
    ],
  )
}

export async function patchSortPackVersionMetadata(
  pool: pg.Pool,
  packageId: string,
  version: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  if (input.name === undefined && input.description === undefined) return
  await pool.query(
    `UPDATE sort_pack_package_versions
     SET name = COALESCE($3, name),
         description = CASE WHEN $4 THEN $5 ELSE description END
     WHERE package_id = $1 AND version = $2`,
    [
      packageId,
      version,
      input.name?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
    ],
  )
}

export async function pluginVersionExists(
  pool: pg.Pool,
  packageId: string,
  version: string,
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM plugin_package_versions WHERE package_id = $1 AND version = $2`,
    [packageId, version],
  )
  return Boolean(res.rows[0])
}

export async function insertPluginVersionSnapshot(
  pool: pg.Pool,
  input: {
    packageId: string
    version: string
    manifest: PluginManifest
    remoteEndpoint?: string | null
    wasmSha256?: string | null
    wasmSize?: number | null
    wasmArtifact?: Buffer | null
    name: string
    description?: string | null
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO plugin_package_versions (
       package_id, version, manifest, remote_endpoint, wasm_sha256, wasm_size, wasm_artifact,
       name, description
     )
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (package_id, version) DO UPDATE
       SET manifest = EXCLUDED.manifest,
           remote_endpoint = EXCLUDED.remote_endpoint,
           wasm_sha256 = EXCLUDED.wasm_sha256,
           wasm_size = EXCLUDED.wasm_size,
           wasm_artifact = EXCLUDED.wasm_artifact,
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
    [
      input.packageId,
      input.version,
      JSON.stringify(input.manifest),
      input.remoteEndpoint ?? null,
      input.wasmSha256 ?? null,
      input.wasmSize ?? null,
      input.wasmArtifact ?? null,
      input.name,
      input.description ?? null,
    ],
  )
}

export async function patchPluginVersionMetadata(
  pool: pg.Pool,
  packageId: string,
  version: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  if (input.name === undefined && input.description === undefined) return
  await pool.query(
    `UPDATE plugin_package_versions
     SET name = COALESCE($3, name),
         description = CASE WHEN $4 THEN $5 ELSE description END
     WHERE package_id = $1 AND version = $2`,
    [
      packageId,
      version,
      input.name?.trim() || null,
      input.description !== undefined,
      input.description === undefined ? null : input.description?.trim() || null,
    ],
  )
}
