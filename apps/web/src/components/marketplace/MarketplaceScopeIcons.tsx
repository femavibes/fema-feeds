import type { LogicBlockPackage } from '@cfb/core-types'

type IconProps = { className?: string }

export function MarketplaceGlobeIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.8 3.2 2.8 14.8 0 18" />
      <path d="M12 3c-2.8 3.2-2.8 14.8 0 18" />
    </svg>
  )
}

export function MarketplaceDeploymentIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="5" width="16" height="6" rx="1.5" />
      <rect x="4" y="13" width="16" height="6" rx="1.5" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function MarketplaceCatalogAllIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3 3 8.5 12 14l9-5.5L12 3z" />
      <path d="M3 13.5 12 19l9-5.5" />
    </svg>
  )
}

export function MarketplacePrivateIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function MarketplaceVerifiedMark({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 12.5 10 16.5 18 8" />
    </svg>
  )
}

const SCOPE_ICON: Record<'all' | 'global' | 'deployment', typeof MarketplaceCatalogAllIcon> = {
  all: MarketplaceCatalogAllIcon,
  global: MarketplaceGlobeIcon,
  deployment: MarketplaceDeploymentIcon,
}

const SCOPE_TITLE: Record<'all' | 'global' | 'deployment', string> = {
  all: 'All catalogs',
  global: 'Global marketplace',
  deployment: 'This deployment',
}

interface ScopeToggleProps {
  value: 'all' | 'global' | 'deployment'
  onChange: (value: 'all' | 'global' | 'deployment') => void
  options?: Array<'all' | 'global' | 'deployment'>
}

export function MarketplaceScopeToggle({
  value,
  onChange,
  options = ['all', 'global', 'deployment'],
}: ScopeToggleProps) {
  return (
    <div className="marketplace-scope-toggle" role="group" aria-label="Catalog scope">
      {options.map((opt) => {
        const Icon = SCOPE_ICON[opt]
        return (
          <button
            key={opt}
            type="button"
            className={`marketplace-scope-toggle-btn${value === opt ? ' is-active' : ''}`}
            title={SCOPE_TITLE[opt]}
            aria-label={SCOPE_TITLE[opt]}
            aria-pressed={value === opt}
            onClick={() => onChange(opt)}
          >
            <Icon className="marketplace-scope-toggle-icon" />
          </button>
        )
      })}
    </div>
  )
}

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
  if (pkg.trustTier === 'deployment_verified') return 'Verified on this deployment'
  if (pkg.visibility === 'deployment') return 'Published here (unverified)'
  if (pkg.visibility === 'global') return 'Global marketplace'
  return null
}

export function LogicBlockTrustBadge({
  tier,
  visibility,
  sources,
}: {
  tier: LogicBlockPackage['trustTier']
  visibility: LogicBlockPackage['visibility']
  sources?: string[]
}) {
  const hasBoth = sources && sources.includes('global') && sources.includes('deployment')

  if (hasBoth) {
    return (
      <span
        className="marketplace-scope-badge is-dual"
        title="Global marketplace + this deployment"
        aria-label="Global marketplace + this deployment"
      >
        <MarketplaceGlobeIcon className="marketplace-scope-badge-icon" />
        <MarketplaceDeploymentIcon className="marketplace-scope-badge-icon" />
        {(tier === 'global_verified' || tier === 'deployment_verified') && (
          <MarketplaceVerifiedMark className="marketplace-scope-badge-mark" />
        )}
      </span>
    )
  }

  if (tier === 'global_verified') {
    return (
      <span
        className="marketplace-scope-badge is-global is-verified"
        title="Global marketplace verified"
        aria-label="Global marketplace verified"
      >
        <MarketplaceGlobeIcon className="marketplace-scope-badge-icon" />
        <MarketplaceVerifiedMark className="marketplace-scope-badge-mark" />
      </span>
    )
  }
  if (tier === 'deployment_verified') {
    return (
      <span
        className="marketplace-scope-badge is-deployment is-verified"
        title="Verified on this deployment"
        aria-label="Verified on this deployment"
      >
        <MarketplaceDeploymentIcon className="marketplace-scope-badge-icon" />
        <MarketplaceVerifiedMark className="marketplace-scope-badge-mark" />
      </span>
    )
  }
  if (visibility === 'global') {
    return (
      <span
        className="marketplace-scope-badge is-global"
        title="Global marketplace"
        aria-label="Global marketplace"
      >
        <MarketplaceGlobeIcon className="marketplace-scope-badge-icon" />
      </span>
    )
  }
  if (visibility === 'deployment') {
    return (
      <span
        className="marketplace-scope-badge is-deployment"
        title="This deployment (unverified)"
        aria-label="This deployment (unverified)"
      >
        <MarketplaceDeploymentIcon className="marketplace-scope-badge-icon" />
      </span>
    )
  }
  if (visibility === 'collection') {
    return (
      <span className="marketplace-scope-badge is-private" title="Private" aria-label="Private">
        <MarketplacePrivateIcon className="marketplace-scope-badge-icon" />
      </span>
    )
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
