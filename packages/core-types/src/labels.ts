import type { NormalizedPost } from './index.js'

/** Bluesky's official moderation labeler (Ozone). */
export const BLUESKY_MODERATION_LABELER_DID = 'did:plc:ar7c4by46qjdydhdevvrndac'

/** Label applied by a moderation service (not self-label on the record). */
export interface LabelerLabel {
  val: string
  /** Labeler DID that published the label. */
  src: string
}

export type LabelSourceScope = 'all' | 'self' | 'labeler'

/** Union of self-label and labeler label values (deduped). */
export function allLabelValues(
  post: Pick<NormalizedPost, 'selfLabels' | 'labelerLabels'>,
): string[] {
  const out = new Set<string>()
  for (const v of post.selfLabels) out.add(v)
  for (const l of post.labelerLabels) out.add(l.val)
  return [...out]
}

/** Label values for filtering, optionally scoped to self or specific labelers. */
export function labelValuesForScope(
  post: Pick<NormalizedPost, 'selfLabels' | 'labelerLabels'>,
  scope: LabelSourceScope,
  labelerDids?: string[],
): string[] {
  if (scope === 'self') return [...post.selfLabels]
  if (scope === 'labeler') {
    const allow = labelerDids?.length ? new Set(labelerDids) : null
    return post.labelerLabels
      .filter((l) => !allow || allow.has(l.src))
      .map((l) => l.val)
  }
  return allLabelValues(post)
}

export function labelScopeMatches(
  post: Pick<NormalizedPost, 'selfLabels' | 'labelerLabels'>,
  wanted: string[],
  scope: LabelSourceScope,
  labelerDids?: string[],
): boolean {
  if (wanted.length === 0) return false
  const have = new Set(labelValuesForScope(post, scope, labelerDids).map((v) => v.toLowerCase()))
  return wanted.some((w) => have.has(w.toLowerCase()))
}
