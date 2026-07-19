/** Mirror of @cfb/l2-eval resolveLogicBlockVersionPin for web (no l2-eval dep). */
export function isPatchUpgrade(pinned: string, latest: string): boolean {
  const pp = pinned.split('.').map((n) => Number(n) || 0)
  const lp = latest.split('.').map((n) => Number(n) || 0)
  return (
    pp[0] === lp[0] &&
    pp[1] === lp[1] &&
    (lp[2] ?? 0) > (pp[2] ?? 0) &&
    compareSemver(latest, pinned) > 0
  )
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function resolveLogicBlockVersionPin(
  pinned: string,
  latest: string,
  policy: 'pinned' | 'notify' | 'auto_minor' | undefined,
): string {
  if (policy === 'auto_minor' && isPatchUpgrade(pinned, latest)) return latest
  return pinned
}
