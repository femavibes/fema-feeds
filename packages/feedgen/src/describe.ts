import type { FeedConfig } from '@cfb/core-types'
import { isFeedPubliclyServed } from '@cfb/core-types'
import { buildPublishedFeedUri } from './uri.js'

export interface DescribeFeedGeneratorResponse {
  did: string
  feeds: Array<{ uri: string }>
  links?: { privacyPolicy?: string; termsOfService?: string }
}

export function handleDescribeFeedGenerator(
  feeds: FeedConfig[],
  serviceDid: string,
  options?: {
    publisherDid?: string
    privacyPolicy?: string
    termsOfService?: string
  },
): DescribeFeedGeneratorResponse | { error: string; status: number } {
  if (!serviceDid) {
    return { error: 'Feed generator DID not configured', status: 503 }
  }

  const publisherDid = options?.publisherDid ?? serviceDid

  const published = feeds
    .filter((f) => isFeedPubliclyServed(f))
    .map((f) => ({
      uri: buildPublishedFeedUri(f.ownerDid ?? publisherDid, f),
    }))

  return {
    did: serviceDid,
    feeds: published,
    links:
      options?.privacyPolicy || options?.termsOfService
        ? {
            privacyPolicy: options.privacyPolicy,
            termsOfService: options.termsOfService,
          }
        : undefined,
  }
}
