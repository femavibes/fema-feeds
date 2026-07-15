/** Post substitution: reply→root promotion with vote thresholds. */

export type SubstitutionDirection = 'reply_to_root' | 'reply_to_parent' | 'quote_to_quoted' | 'quoted_to_quoters' | 'replied_to_repliers'

export interface SubstitutionVote {
  id?: number
  projectId: string
  feedId: string
  pathwayId: string
  targetUri: string
  sourceUri: string
  createdAt?: string
}

export interface SubstitutionTarget {
  targetUri: string
  voteCount: number
  ready: boolean
}
