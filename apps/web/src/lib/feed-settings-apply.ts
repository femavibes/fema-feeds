import type { FeedConfig } from '@cfb/core-types'

export function rankSettingsMatch(
  a: FeedConfig['rank'] | undefined,
  b: FeedConfig['rank'] | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

export function personalizationSettingsMatch(
  a: FeedConfig['personalization'] | undefined,
  b: FeedConfig['personalization'] | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

export function sortingSettingsApplied(staging: FeedConfig, live: FeedConfig | null): boolean {
  if (!live) return false
  return rankSettingsMatch(staging.rank, live.rank)
}

export function personalizationSettingsApplied(staging: FeedConfig, live: FeedConfig | null): boolean {
  if (!live) return false
  return personalizationSettingsMatch(staging.personalization, live.personalization)
}
