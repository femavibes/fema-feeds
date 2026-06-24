import type { FeedgenSettings } from '@cfb/core-types'
import { resolveFeedgenPublicBaseUrl } from '@cfb/core-types'
import type { FeedgenEnvFallback } from './feedgen-settings.js'

export function envPublicBaseUrl(env: FeedgenEnvFallback): string {
  return (
    env.publicBaseUrl?.trim() ||
    `http://localhost:${env.apiPort ?? '3000'}`
  )
}

export function mergeResolvedFeedgenSettings(
  fromDb: FeedgenSettings,
  env: FeedgenEnvFallback,
  opts?: { cloudflareTokenSet?: boolean },
): FeedgenSettings {
  const envDid = env.generatorDid?.trim() ?? ''
  const envUrl = envPublicBaseUrl(env)
  const publicBaseUrl = resolveFeedgenPublicBaseUrl(fromDb, envUrl, opts)

  return {
    ...fromDb,
    generatorDid: fromDb.generatorDid?.trim() || envDid,
    publicBaseUrl,
    privacyPolicyUrl: fromDb.privacyPolicyUrl?.trim() || env.privacyPolicyUrl?.trim() || undefined,
    termsOfServiceUrl:
      fromDb.termsOfServiceUrl?.trim() || env.termsOfServiceUrl?.trim() || undefined,
  }
}
