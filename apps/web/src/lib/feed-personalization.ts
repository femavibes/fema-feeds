import type { FeedConfig, L2Expr, SortPackPackage } from '@cfb/core-types'

export function personalizationFormulasMatch(
  a: L2Expr | undefined,
  b: L2Expr | undefined,
): boolean {
  if (!a || !b) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

export function applyPersonalizationFormulaPack(
  draft: FeedConfig,
  pack: Pick<SortPackPackage, 'id' | 'version' | 'name' | 'sortKey'>,
): FeedConfig {
  return {
    ...draft,
    personalization: {
      ...draft.personalization,
      formulaEnabled: true,
      formula: pack.sortKey,
      formulaPackRef: {
        packageId: pack.id,
        versionPin: pack.version,
        label: pack.name,
      },
    },
  }
}

export function clearPersonalizationFormulaPackRef(draft: FeedConfig): FeedConfig {
  if (!draft.personalization?.formulaPackRef) return draft
  const { formulaPackRef: _removed, ...rest } = draft.personalization
  return { ...draft, personalization: rest }
}
