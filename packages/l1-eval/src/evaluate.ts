import type {
  L1MergedResult,
  L1ProjectResult,
  L1StepId,
  L1_NEVER_BYPASS,
  NormalizedPost,
  ProjectL1Config,
} from '@cfb/core-types'
import { getL1FilterStep } from '@cfb/l1-filters'
import { L1_STEP_ORDER, isStepBypassed, type L1EvalContext } from '@cfb/l1-registry'

/** Steps replaced by compiled ingest_gate from live feeds. */
const DISCOVERY_STEPS_SUPERSEDED_BY_INGEST_GATE: ReadonlySet<L1StepId> = new Set([
  'follow_ring',
  'language',
  'language_unknown',
  'has_video',
  'has_image',
  'has_link_card',
  'has_quote',
  'has_record',
  'has_text_only',
  'hashtag_exclude',
  'hashtag_include',
  'keyword_exclude',
  'keyword_include',
  'post_kind',
  'labels',
])

function stepOrderForConfig(config: ProjectL1Config): readonly L1StepId[] {
  // Feed-compiled projects: jetstream eval is only ingest_gate (+ optional blocklist).
  if (config.compiledL1Meta) {
    const steps: L1StepId[] = []
    if ((config.authorBlocklist?.length ?? 0) > 0) steps.push('author_blocklist')
    steps.push('ingest_gate')
    return steps
  }

  if (!config.ingestGate) return L1_STEP_ORDER
  return L1_STEP_ORDER.filter((id) => !DISCOVERY_STEPS_SUPERSEDED_BY_INGEST_GATE.has(id))
}

export interface L1EvalBatchExtras {
  /** Account-hub L1 follow ring DIDs keyed by projectId (legacy followRing field). */
  accountFollowRings?: Record<string, string[]>
  /** Per-project extras for compiled ingest_gate branches. */
  ingestGateExtrasByProject?: Record<
    string,
    {
      followRingDids?: Record<string, string[]>
      authorListDids?: Record<string, string[]>
    }
  >
}

/**
 * Evaluate L1 for a single project. Short-circuits on first fail.
 * Author fast-path ends eval early as PASS after allowlist step.
 */
export function evaluateProjectL1(
  post: NormalizedPost,
  config: ProjectL1Config,
  extras?: L1EvalBatchExtras,
): L1ProjectResult {
  if (!config.enabled) {
    return { projectId: config.projectId, matched: false, trace: [] }
  }

  if (config.compiledL1Meta) {
    const legacyNoFeeds =
      config.compiledL1Meta.source !== 'prefilter' &&
      (config.compiledL1Meta.liveFeedIds?.length ?? 0) === 0
    if (legacyNoFeeds) {
      return {
        projectId: config.projectId,
        matched: false,
        trace: [
          {
            stepId: 'ingest_gate',
            outcome: 'fail',
            detail: 'no live feeds — project not ingesting (legacy feed compile)',
          },
        ],
      }
    }
  }

  const ctx: L1EvalContext = {
    post,
    config,
    authorFastPathActive: false,
    bypassedSteps: new Set<L1StepId>(),
    trace: [],
    accountFollowRingDids: extras?.accountFollowRings?.[config.projectId],
    ingestGateExtras: extras?.ingestGateExtrasByProject?.[config.projectId],
  }

  for (const stepId of stepOrderForConfig(config)) {
    if (isStepBypassed(stepId, ctx.bypassedSteps)) {
      ctx.trace.push({ stepId, outcome: 'skip', detail: 'author fast-path bypass' })
      continue
    }

    const step = getL1FilterStep(stepId)
    if (!step) continue

    const outcome = step.evaluate(ctx)

    if (outcome === 'fail') {
      return { projectId: config.projectId, matched: false, trace: ctx.trace }
    }

    if (outcome === 'bypass_remaining') {
      return {
        projectId: config.projectId,
        matched: true,
        matchedVia: 'author',
        trace: ctx.trace,
      }
    }
  }

  return {
    projectId: config.projectId,
    matched: true,
    matchedVia: ctx.authorFastPathActive ? 'author' : 'jetstream',
    trace: ctx.trace,
  }
}

/** Evaluate all project L1 configs against one post (merged Jetstream pass). */
export function evaluateMergedL1(
  post: NormalizedPost,
  configs: ProjectL1Config[],
  extras?: L1EvalBatchExtras,
): L1MergedResult {
  const projects = configs.map((c) => evaluateProjectL1(post, c, extras))
  return { postUri: post.uri, projects }
}

export function getMatchedProjects(result: L1MergedResult): L1ProjectResult[] {
  return result.projects.filter((p) => p.matched)
}

// re-export for tests that need never_bypass list
export { L1_NEVER_BYPASS }
