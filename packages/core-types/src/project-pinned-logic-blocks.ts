import type { LogicBlockRef } from './logic-blocks.js'

export interface ProjectPinnedLogicBlocksFields {
  /** @deprecated Prefer pinnedLogicBlocks */
  pinnedLogicBlock?: LogicBlockRef
  pinnedLogicBlocks?: LogicBlockRef[]
}

/** Read pinned logic blocks, migrating legacy single-pin projects. */
export function projectPinnedLogicBlocks(
  project: ProjectPinnedLogicBlocksFields,
): LogicBlockRef[] {
  if (project.pinnedLogicBlocks?.length) return [...project.pinnedLogicBlocks]
  if (project.pinnedLogicBlock) return [project.pinnedLogicBlock]
  return []
}

export function isProjectLogicBlockPinned(
  project: ProjectPinnedLogicBlocksFields,
  packageId: string,
): boolean {
  return projectPinnedLogicBlocks(project).some((ref) => ref.packageId === packageId)
}

/** Replace pinned logic blocks and drop the legacy single-pin field. */
export function setProjectPinnedLogicBlocks<T extends ProjectPinnedLogicBlocksFields>(
  project: T,
  blocks: LogicBlockRef[],
): T {
  const next = { ...project } as T
  delete next.pinnedLogicBlock
  if (blocks.length === 0) {
    delete next.pinnedLogicBlocks
  } else {
    next.pinnedLogicBlocks = blocks
  }
  return next
}

export function pinProjectLogicBlock<T extends ProjectPinnedLogicBlocksFields>(
  project: T,
  ref: LogicBlockRef,
): T {
  const existing = projectPinnedLogicBlocks(project)
  const without = existing.filter((item) => item.packageId !== ref.packageId)
  return setProjectPinnedLogicBlocks(project, [...without, ref])
}

export function unpinProjectLogicBlock<T extends ProjectPinnedLogicBlocksFields>(
  project: T,
  packageId: string,
): T {
  return setProjectPinnedLogicBlocks(
    project,
    projectPinnedLogicBlocks(project).filter((ref) => ref.packageId !== packageId),
  )
}

export function updatePinnedLogicBlockVersion<T extends ProjectPinnedLogicBlocksFields>(
  project: T,
  packageId: string,
  versionPin: string,
): T {
  const blocks = projectPinnedLogicBlocks(project)
  if (!blocks.some((ref) => ref.packageId === packageId)) return project
  return setProjectPinnedLogicBlocks(
    project,
    blocks.map((ref) =>
      ref.packageId === packageId ? { ...ref, versionPin } : ref,
    ),
  )
}
