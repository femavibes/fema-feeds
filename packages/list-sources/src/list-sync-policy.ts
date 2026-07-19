/**
 * Size-based audit + manual-refresh cooldown policy for Bluesky lists.
 * Jetstream listitem sync is primary; these intervals are for reconcile / abuse control.
 */

export type BlueskyListSizeBucket = 'small' | 'medium' | 'large' | 'huge'

export function blueskyListSizeBucket(memberCount: number): BlueskyListSizeBucket {
  if (memberCount < 500) return 'small'
  if (memberCount < 5_000) return 'medium'
  if (memberCount < 20_000) return 'large'
  return 'huge'
}

/** Hours between full getList audit polls (Jetstream covers realtime). */
export function auditIntervalHours(memberCount: number): number {
  switch (blueskyListSizeBucket(memberCount)) {
    case 'small':
      return 6
    case 'medium':
      return 24
    case 'large':
      return 72
    case 'huge':
      return 168
  }
}

/** Minutes a manual Refresh is blocked after a successful refresh (global per list). */
export function manualRefreshCooldownMinutes(memberCount: number): number {
  switch (blueskyListSizeBucket(memberCount)) {
    case 'small':
      return 1
    case 'medium':
      return 5
    case 'large':
      return 30
    case 'huge':
      return 120
  }
}

export function scheduleNextAuditAt(memberCount: number, from = new Date()): Date {
  const hours = auditIntervalHours(memberCount)
  return new Date(from.getTime() + hours * 60 * 60_000)
}

export function manualRefreshCooldownRemainingMs(
  lastManualRefreshAt: Date | null | undefined,
  memberCount: number,
  now = new Date(),
): number {
  if (!lastManualRefreshAt) return 0
  const coolMs = manualRefreshCooldownMinutes(memberCount) * 60_000
  const elapsed = now.getTime() - lastManualRefreshAt.getTime()
  return Math.max(0, coolMs - elapsed)
}

/** Human-readable policy table for UI tooltips / help modals. */
export const BLUESKY_LIST_SYNC_POLICY_ROWS = [
  { size: '< 500', audit: 'every 6 hours', refreshCooldown: '1 minute' },
  { size: '500 – 5k', audit: 'every 24 hours', refreshCooldown: '5 minutes' },
  { size: '5k – 20k', audit: 'every 3 days', refreshCooldown: '30 minutes' },
  { size: '20k+', audit: 'every 7 days', refreshCooldown: '2 hours' },
] as const
