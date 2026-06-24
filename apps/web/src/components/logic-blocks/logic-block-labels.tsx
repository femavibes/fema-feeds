import type { LogicBlockPackage } from '@cfb/core-types'

export function visibilityLabel(visibility: LogicBlockPackage['visibility']) {
  switch (visibility) {
    case 'collection':
      return 'My collection'
    case 'deployment':
      return 'This deployment'
    case 'global':
      return 'Global marketplace'
  }
}

export function trustLabel(pkg: Pick<LogicBlockPackage, 'trustTier' | 'visibility'>) {
  if (pkg.trustTier === 'global_verified') return 'Global marketplace verified'
  if (pkg.trustTier === 'deployment_verified') return 'Verified on this deployment only'
  if (pkg.visibility === 'deployment') return 'Published here (unverified)'
  return null
}

export function LogicBlockTrustBadge({
  tier,
  visibility,
}: {
  tier: LogicBlockPackage['trustTier']
  visibility: LogicBlockPackage['visibility']
}) {
  if (tier === 'global_verified') {
    return <span className="badge badge-on">Global marketplace verified</span>
  }
  if (tier === 'deployment_verified') {
    return <span className="badge badge-muted">This deployment only</span>
  }
  if (visibility === 'deployment') {
    return <span className="badge badge-muted">Unverified</span>
  }
  if (visibility === 'collection') {
    return <span className="badge badge-muted">Private</span>
  }
  return null
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0)
  const pb = b.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
