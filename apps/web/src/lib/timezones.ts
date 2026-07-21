/** Common IANA timezones for feed Param triggers (not exhaustive). */
export const FEED_TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris / Central Europe' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'China (Shanghai)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]

export function normalizeFeedTimezone(tz: string | undefined): string {
  const t = tz?.trim()
  if (!t) return 'UTC'
  if (FEED_TIMEZONE_OPTIONS.some((o) => o.value === t)) return t
  return t
}
