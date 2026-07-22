import type { FeedConfig } from '@cfb/core-types'
import type { SortTestResult } from '../../api/client'
import {
  DEFAULT_SORT_TUNING,
  detectEngagementWeights,
  engagementFormulaLabel,
} from '../../lib/feed-sorting'
import {
  formatBreakdownValue,
  formatSortScore,
  sortBreakdownFields,
  sortFieldLabel,
} from '../../lib/sort-test-display'

interface Props {
  result: SortTestResult
  feed?: FeedConfig
  compact?: boolean
}

export function SortTestBreakdown({ result, feed, compact = false }: Props) {
  const tuning = feed?.rank?.tuning ?? DEFAULT_SORT_TUNING
  const formulaLabel = feed?.rank?.sortKey
    ? engagementFormulaLabel(detectEngagementWeights(feed.rank.sortKey), tuning)
    : null
  const fields = sortBreakdownFields(result.fields)

  return (
    <div className={`sort-tester-result${compact ? ' sort-tester-result-compact' : ''}`}>
      <div className="sort-tester-score">
        <span className="sort-tester-score-label">Total rank score</span>
        <span className="sort-tester-score-value">{formatSortScore(result.sortKey)}</span>
      </div>

      {formulaLabel ? (
        <p className="sort-tester-formula card-hint">{formulaLabel}</p>
      ) : null}

      <div className="sort-tester-breakdown">
        <p className="sort-tester-breakdown-title">Field values used in the formula</p>
        <table className="sort-tester-table">
          <tbody>
            {fields.map((f) => (
              <tr
                key={f.field}
                className={
                  f.field === 'post_age_hours' || f.field === 'editor_score'
                    ? 'sort-tester-row-highlight'
                    : undefined
                }
              >
                <td className="sort-tester-field">{sortFieldLabel(f.field)}</td>
                <td className="sort-tester-value">{formatBreakdownValue(f.field, f.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
