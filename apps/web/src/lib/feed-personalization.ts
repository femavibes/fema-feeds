import type { FeedConfig, L2Expr, SortPackPackage, SortPackUpdatePolicy } from '@cfb/core-types'

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
  updatePolicy: SortPackUpdatePolicy = 'notify',
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
        updatePolicy,
      },
    },
  }
}

export function setPersonalizationFormulaUpdatePolicy(
  draft: FeedConfig,
  updatePolicy: SortPackUpdatePolicy,
): FeedConfig {
  const ref = draft.personalization?.formulaPackRef
  if (!ref) return draft
  return {
    ...draft,
    personalization: {
      ...draft.personalization,
      formulaPackRef: { ...ref, updatePolicy },
    },
  }
}

export function clearPersonalizationFormulaPackRef(draft: FeedConfig): FeedConfig {
  if (!draft.personalization?.formulaPackRef) return draft
  const { formulaPackRef: _removed, ...rest } = draft.personalization
  return { ...draft, personalization: rest }
}
