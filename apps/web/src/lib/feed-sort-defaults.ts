import type {
  ContentSignals,
  EngagementWeights,
  MediaBonus,
  RatioSignals,
  SortTuning,
} from '@cfb/core-types'

export const DEFAULT_ENGAGEMENT_WEIGHTS: EngagementWeights = {
  likes: { enabled: true, weight: 1 },
  reposts: { enabled: true, weight: 2 },
  replies: { enabled: true, weight: 1 },
  quotes: { enabled: false, weight: 1 },
  bookmarks: { enabled: false, weight: 3 },
  audienceLikes: { enabled: false, weight: 3 },
  audienceReposts: { enabled: false, weight: 5 },
}

export const DEFAULT_CONTENT_SIGNALS: ContentSignals = {
  authorFollowers: { enabled: false, weight: 0 },
  authorPosts: { enabled: false, weight: 0 },
  textLength: { enabled: false, weight: 0 },
  hashtagCount: { enabled: false, weight: 0 },
  mentionCount: { enabled: false, weight: 0 },
  linkCount: { enabled: false, weight: 0 },
  altTextBonus: { enabled: false, weight: 0 },
  rootPostBonus: { enabled: false, weight: 0 },
  replyBonus: { enabled: false, weight: 0 },
  quotePostBonus: { enabled: false, weight: 0 },
}

export const DEFAULT_RATIO_SIGNALS: RatioSignals = {
  engagementRate: { enabled: false, weight: 0 },
  replyRatio: { enabled: false, weight: 0 },
  quoteRatio: { enabled: false, weight: 0 },
}

export const DEFAULT_MEDIA_BONUS: MediaBonus = {
  image: { enabled: false, weight: 0 },
  video: { enabled: false, weight: 0 },
  linkCard: { enabled: false, weight: 0 },
}

export const DEFAULT_SORT_TUNING: SortTuning = {
  decayMode: 'none',
  decayHalfLifeHours: 24,
  editorScoreWeight: 0,
  authorFairness: 'off',
  mediaBonus: { ...DEFAULT_MEDIA_BONUS },
  contentSignals: { ...DEFAULT_CONTENT_SIGNALS },
  ratioSignals: { ...DEFAULT_RATIO_SIGNALS },
  scoreCap: 0,
  scoreFloor: 0,
}
