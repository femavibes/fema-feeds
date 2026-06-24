import type { FeedConfig, L2RuleGroup } from './l2.js'

/** Always-on project ingest graph — separate from feed L2 refinement rules. */
export interface ProjectPrefilter {
  match: L2RuleGroup
  visualLayout?: FeedConfig['visualLayout']
}

export const PROJECT_PREFILTER_SCOPE_ID = '__prefilter__'
