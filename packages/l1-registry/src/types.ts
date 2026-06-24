import type {
  L1StepId,
  L1StepOutcome,
  L1StepTrace,
  NormalizedPost,
  ProjectL1Config,
} from '@cfb/core-types'

/** Runtime context for a single L1 step evaluation. */
export interface L1EvalContext {
  post: NormalizedPost
  config: ProjectL1Config
  /** True when author matched an allowlist with fast-path active this eval. */
  authorFastPathActive: boolean
  /** Steps already bypassed by author fast-path. */
  bypassedSteps: Set<L1StepId>
  trace: L1StepTrace[]
  /** Cached account-hub ring DIDs for L1 follow_ring (keyed by l1:projectId). */
  accountFollowRingDids?: string[]
  /** Follow-ring + author-list DIDs for compiled ingest_gate branches. */
  ingestGateExtras?: {
    followRingDids?: Record<string, string[]>
    authorListDids?: Record<string, string[]>
  }
}

export interface L1FilterStep {
  readonly id: L1StepId
  /**
   * Evaluate this step. Return outcome; caller appends trace.
   * `bypass_remaining` ends L1 for this project as PASS (author fast-path).
   */
  evaluate(ctx: L1EvalContext): L1StepOutcome
}

export function pushTrace(
  ctx: L1EvalContext,
  stepId: L1StepId,
  outcome: L1StepOutcome,
  detail?: string,
): L1StepOutcome {
  ctx.trace.push({ stepId, outcome, detail })
  return outcome
}
