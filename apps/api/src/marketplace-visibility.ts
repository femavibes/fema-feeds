import { isDirectGlobalPublishAllowed } from './global-marketplace.js'

export function rejectOwnerGlobalVisibility(
  visibility: string,
): { error: string; hint: string } | null {
  if (visibility === 'global' && !isDirectGlobalPublishAllowed()) {
    return {
      error: 'global_listing_requires_review',
      hint: 'Submit a global listing request from My collection. The marketplace operator reviews all global submissions.',
    }
  }
  return null
}
