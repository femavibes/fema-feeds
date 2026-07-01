/** Native personalization config — built-in viewer-aware adjustments at serve time. */
export interface NativePersonalizationConfig {
  /** Boost posts from accounts the viewer follows. */
  boostFollowed?: { enabled: boolean; factor: number }
  /** Extra boost for mutual follows. */
  boostMutuals?: { enabled: boolean; factor: number }
  /** Penalize posts the viewer has already been served. */
  suppressSeen?: { enabled: boolean; penalty: number; windowHours: number }
  /** Prevent N+ consecutive posts from the same author in a page. */
  authorDiversity?: { enabled: boolean; maxConsecutive: number }
  /** Boost posts from authors the viewer frequently interacts with. */
  affinityBoost?: { enabled: boolean; factor: number; windowDays: number }
  /**
   * Formula mode — if set, overrides the toggle-based personalization.
   * Uses the same L2Expr format as sorting but with viewer-relative fields.
   */
  formulaEnabled?: boolean
  formula?: import('./l2.js').L2Expr
}

export const DEFAULT_PERSONALIZATION: NativePersonalizationConfig = {
  boostFollowed: { enabled: false, factor: 1.3 },
  boostMutuals: { enabled: false, factor: 1.5 },
  suppressSeen: { enabled: false, penalty: 0.5, windowHours: 48 },
  authorDiversity: { enabled: false, maxConsecutive: 2 },
  affinityBoost: { enabled: false, factor: 1.2, windowDays: 30 },
}
