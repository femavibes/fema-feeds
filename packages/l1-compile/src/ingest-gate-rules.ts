import type {

  IngestGateAllRule,

  IngestGateAnyRule,

  IngestGateBranch,

  IngestGateNOfRule,

  IngestGateNoneRule,

  IngestGateRule,

} from '@cfb/core-types'



export type IngestGateCompositeRule =

  | IngestGateAllRule

  | IngestGateAnyRule

  | IngestGateNoneRule

  | IngestGateNOfRule



export function isIngestGateComposite(rule: IngestGateRule): rule is IngestGateCompositeRule {

  return (

    rule.type === 'all' ||

    rule.type === 'any' ||

    rule.type === 'none' ||

    rule.type === 'n_of'

  )

}



/** Child rules of a composite node (supports legacy `all.branches` leaves-only). */

export function ingestCompositeChildren(rule: IngestGateCompositeRule): IngestGateRule[] {

  if (rule.rules?.length) return rule.rules

  if (rule.type === 'all' && rule.branches?.length) {

    return rule.branches

  }

  return []

}



export function walkIngestBranches(

  rules: IngestGateRule[],

  visit: (branch: IngestGateBranch) => void,

): void {

  for (const rule of rules) {

    if (isIngestGateComposite(rule)) {

      walkIngestBranches(ingestCompositeChildren(rule), visit)

    } else {

      visit(rule)

    }

  }

}



export function collectAuthorIncludeBranches(
  rules: IngestGateRule[],
): Extract<IngestGateBranch, { type: 'author' }>[] {
  const out: Extract<IngestGateBranch, { type: 'author' }>[] = []
  walkIngestBranches(rules, (branch) => {
    if (branch.type === 'author' && branch.op === 'in_list') out.push(branch)
  })
  return out
}

export function collectFollowRingBranches(
  rules: IngestGateRule[],
): Extract<IngestGateBranch, { type: 'follow_ring' }>[] {
  const out: Extract<IngestGateBranch, { type: 'follow_ring' }>[] = []

  walkIngestBranches(rules, (branch) => {

    if (branch.type === 'follow_ring') out.push(branch)

  })

  return out

}


