import type { ScoringConfig } from './types.js'

/** Near You defaults — geo omitted; viewer factors enabled when `viewer` is present. */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  freshnessHalflifeHours: 24,
  freshnessExponent: 1.5,
  likeWeight: 1.0,
  repostWeight: 0.5,
  replyWeight: 0.75,
  quoteWeight: 0.5,
  engagementScale: 'sqrt',
  engagementScaleFactor: 1.0,
  engagementExponent: 0.6,
  coldStartMin: 1.0,
  mediaMultiplier: 1.05,
  altTextPenalty: 0.85,
  altTextEnabled: true,
  hashtagPostWeight: 0.95,
  followerNormEnabled: true,
  followerNormBaselineRate: 0.01,
  followerNormMaxBoost: 2.5,
  followerNormMinFollowers: 50,
  followerNormBoostDampRate: 0.15,
  followerNormPenaltyAmpRate: 0.2,
  velocityBoostEnabled: true,
  velocityBaselinePercentile: 75,
  velocityCap: 3.0,
  diversityEnabled: true,
  diversityMinGap: 3,
  followingBoostEnabled: true,
  followingBoostMultiplier: 1.2,
  servedDemotionEnabled: true,
  servedBasePenalty: 0.05,
  servedMinDurationHours: 2,
  servedMaxDurationHours: 6,
  servedVisibilityFloor: 0.3,
  likedDemotionEnabled: true,
  likedPenalty: 0.1,
  repostedDemotionEnabled: true,
  repostedPenalty: 0.15,
}

export const PRESETS: Record<string, Partial<ScoringConfig>> = {
  balanced: {},
  fresh: {
    freshnessHalflifeHours: 12,
    freshnessExponent: 2.0,
    velocityBoostEnabled: false,
  },
  engagement: {
    freshnessHalflifeHours: 48,
    freshnessExponent: 1.0,
    repostWeight: 1.0,
    replyWeight: 1.0,
    engagementExponent: 0.75,
    velocityBoostEnabled: true,
    velocityCap: 4.0,
  },
}

export function resolveScoringConfig(config: Record<string, unknown> | undefined): ScoringConfig {
  const preset = typeof config?.preset === 'string' ? config.preset : 'balanced'
  const base = { ...DEFAULT_SCORING_CONFIG, ...(PRESETS[preset] ?? {}) }
  const gap = config?.diversityMinGap
  if (typeof gap === 'number' && Number.isFinite(gap)) {
    base.diversityMinGap = Math.max(0, Math.min(10, Math.floor(gap)))
  }
  return base
}
