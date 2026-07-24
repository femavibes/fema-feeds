import type { FeedConfig, SortPackEditorMode, SortPackEditorProfile, SortPackPackage } from '@cfb/core-types'
import { DEFAULT_SORT_TUNING } from './feed-sort-defaults'
import { detectSortMode } from './feed-sorting'

function resolveProfileMode(rank: FeedConfig['rank']): SortPackEditorMode | null {
  if (!rank?.sortKey) return null
  const tagged = rank.sortMode
  if (tagged === 'engagement' || tagged === 'advanced' || tagged === 'builder') {
    return tagged
  }
  const detected = detectSortMode(rank)
  if (detected === 'pack' || detected === 'chronological') return null
  if (detected === 'engagement' || detected === 'advanced' || detected === 'builder') return detected
  return 'builder'
}

export function buildSortEditorProfile(draft: FeedConfig): SortPackEditorProfile | undefined {
  const mode = resolveProfileMode(draft.rank)
  if (!mode) return undefined
  return {
    mode,
    tuning: draft.rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...draft.rank.tuning } : undefined,
  }
}

export function buildPersonalizationEditorProfile(): SortPackEditorProfile {
  return { mode: 'formula' }
}

export function resolveSortPackEditorMode(pkg: SortPackPackage): SortPackEditorMode {
  if (pkg.editorProfile?.mode) return pkg.editorProfile.mode
  if ((pkg.packKind ?? 'sort') === 'personalization') return 'formula'
  const inferred = resolveProfileMode({
    sortKey: pkg.sortKey,
    tuning: pkg.editorProfile?.tuning,
  })
  return inferred ?? 'builder'
}

export function usesSimpleSortEditor(mode: SortPackEditorMode): boolean {
  return mode === 'engagement' || mode === 'advanced'
}

export function profileFromRank(rank: FeedConfig['rank']): SortPackEditorProfile | undefined {
  const mode = resolveProfileMode(rank)
  if (!mode) return undefined
  return {
    mode,
    tuning: rank?.tuning ? { ...DEFAULT_SORT_TUNING, ...rank.tuning } : undefined,
  }
}

export function packToSortDraft(pkg: SortPackPackage): FeedConfig {
  const mode = resolveSortPackEditorMode(pkg)
  const tuning = pkg.editorProfile?.tuning
    ? { ...DEFAULT_SORT_TUNING, ...pkg.editorProfile.tuning }
    : DEFAULT_SORT_TUNING
  return {
    feedId: '__pack_edit__',
    projectId: '',
    name: pkg.name,
    enabled: false,
    poolScope: 'project_only',
    match: { type: 'group', id: 'root', logic: 'any', children: [] },
    rank: {
      sortKey: pkg.sortKey,
      sortMode: mode === 'engagement' || mode === 'advanced' ? mode : mode === 'builder' ? 'builder' : undefined,
      tuning,
    },
  }
}
