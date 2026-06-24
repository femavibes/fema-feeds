/** Operator-provisioned public URL (fema.monster slug, etc.) — set before any user logs in. */
export interface DeploymentInfo {
  slug: string
  dnsBase: string
  publicUrl: string
  publicHost: string
  registeredAt?: string
}

/** Who may use this deployment and who owns operator-level settings. */
export interface DeploymentAccessSettings {
  /** VPS owner / operator — first login becomes master if unset. */
  masterDid?: string
  /** Additional Bluesky DIDs allowed to sign in (friends). */
  allowedDids: string[]
}

export const DEFAULT_DEPLOYMENT_ACCESS: DeploymentAccessSettings = {
  allowedDids: [],
}

export function publicHostForSlug(slug: string, dnsBase: string): string {
  const first = dnsBase.split('.')[0] ?? dnsBase
  const rest = dnsBase.includes('.') ? dnsBase.slice(first.length + 1) : ''
  return rest ? `${slug}.${first}.${rest}` : `${slug}.${dnsBase}`
}

export function publicUrlForSlug(slug: string, dnsBase: string): string {
  return `https://${publicHostForSlug(slug, dnsBase)}`
}

export function canUserLogin(
  did: string,
  access: DeploymentAccessSettings,
): boolean {
  if (!access.masterDid) return true
  if (access.masterDid === did) return true
  return access.allowedDids.includes(did)
}

export function isDeploymentMaster(
  did: string | null | undefined,
  access: DeploymentAccessSettings,
): boolean {
  return Boolean(did && access.masterDid && did === access.masterDid)
}
