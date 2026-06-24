import type { L1StepTrace } from '@cfb/core-types'
import { stepLabel } from '../lib/l1-form'

export function firstL1Failure(trace: L1StepTrace[]): L1StepTrace | undefined {
  return trace.find((t) => t.outcome === 'fail')
}

export function formatL1TraceHighlight(trace: L1StepTrace[], matched: boolean): string | null {
  if (trace.length === 0) return null

  if (!matched) {
    const fail = firstL1Failure(trace)
    if (!fail) return 'Rejected — no failing step recorded'
    const label = stepLabel(fail.stepId)
    return fail.detail?.trim() ? `${label}: ${fail.detail}` : label
  }

  const fastPath = trace.find((t) => t.outcome === 'bypass_remaining')
  if (fastPath?.detail?.trim()) return fastPath.detail.trim()

  const passes = trace.filter((t) => t.outcome === 'pass' && t.detail?.trim())
  const lastPass = passes[passes.length - 1]
  if (lastPass?.detail?.trim()) return lastPass.detail.trim()

  const requiredPasses = trace.filter((t) => t.outcome === 'pass' || t.outcome === 'bypass_remaining')
  if (requiredPasses.length > 0) {
    return `Passed ${requiredPasses.length} L1 filter step${requiredPasses.length === 1 ? '' : 's'}`
  }

  return 'Would enter pool'
}

interface Props {
  trace: L1StepTrace[]
  matched: boolean
}

export function L1TraceList({ trace, matched }: Props) {
  const failureId = firstL1Failure(trace)?.stepId

  if (trace.length === 0) {
    return <p className="card-hint">No filter steps ran (project disabled or empty config).</p>
  }

  return (
    <ol className="trace-list l1-trace-list">
      {trace.map((step, i) => {
        const isFailure = step.stepId === failureId && step.outcome === 'fail'
        const isHighlight =
          matched && (step.outcome === 'bypass_remaining' || (step.outcome === 'pass' && step.detail))
        return (
          <li
            key={`${step.stepId}-${i}`}
            className={`trace-step outcome-${step.outcome}${isFailure ? ' trace-step-failure' : ''}${isHighlight ? ' trace-step-highlight' : ''}`}
          >
            <span className="trace-step-id">{stepLabel(step.stepId)}</span>
            <span className="trace-outcome">{step.outcome.replace('_', ' ')}</span>
            {step.detail ? <span className="trace-detail">{step.detail}</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
