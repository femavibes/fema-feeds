import type { ScoutFeedSource, SubstituteFeedSource, SubstitutePathwayConfig } from '@cfb/core-types'

export { scoutSourceEnabled, substituteSourceEnabled } from '@cfb/core-types'

export function defaultScoutFeedSource(): ScoutFeedSource {
  return {
    type: 'scout',
    enabled: true,
    scouts: [],
    threshold: {
      min: 3,
      max: 8,
      scaleWindowMinutes: 60,
      curve: 'linear',
    },
    maxPostAgeHours: 48,
  }
}

export function defaultSubstitutePathway(): SubstitutePathwayConfig {
  return {
    direction: 'reply_to_root',
    threshold: 1,
    timeWindowHours: 0,
  }
}

export function defaultSubstituteFeedSource(): SubstituteFeedSource {
  return {
    type: 'substitute',
    enabled: true,
    pathways: [defaultSubstitutePathway()],
  }
}
