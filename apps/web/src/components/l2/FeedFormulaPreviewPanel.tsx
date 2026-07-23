import type { L2Expr } from '@cfb/core-types'

import type { EngagementWeights } from '@cfb/core-types'
import { exprToFormula, FORMULA_FIELDS, PERSONALIZATION_FIELDS } from '../../lib/formula-parser'
import { detectEngagementWeights } from '../../lib/feed-sorting'
import {
  PERSONALIZATION_FIELD_GROUPS,
  PERSONALIZATION_TEMPLATES,
} from './feed-personalization-presets'
import { SortFormulaBuilder } from './SortFormulaBuilder'

interface Props {
  expr: L2Expr
  variant: 'sort' | 'personalization'
}

const SIGNAL_LABELS: { key: keyof EngagementWeights; label: string }[] = [
  { key: 'likes', label: 'Likes' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'replies', label: 'Replies' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'bookmarks', label: 'Bookmarks' },
]

export function FeedFormulaPreviewPanel({ expr, variant }: Props) {
  const packWeights = variant === 'sort' ? detectEngagementWeights(expr) : null

  return (
    <div className="feed-formula-preview-panel feed-subscribed-readonly">
      <p className="sidebar-block-title">Formula builder (read-only)</p>
      <SortFormulaBuilder
        readOnly
        draft={variant === 'sort' ? { rank: { sortKey: expr } } : {}}
        onChange={() => undefined}
        initialExpr={expr}
        fields={variant === 'personalization' ? PERSONALIZATION_FIELDS : FORMULA_FIELDS}
        fieldGroups={variant === 'personalization' ? PERSONALIZATION_FIELD_GROUPS : undefined}
        templates={variant === 'personalization' ? PERSONALIZATION_TEMPLATES : undefined}
        placeholder={
          variant === 'personalization'
            ? 'base_score * if(is_followed > 0, 1.3, 1) + feed_affinity * 10'
            : 'likes + reposts * 2 + replies'
        }
      />

      {variant === 'sort' && packWeights ? (
        <div className="feed-subscribed-weights">
          <p className="sidebar-block-title">Engagement signals</p>
          <div className="feed-subscribed-signals-grid">
            {SIGNAL_LABELS.map(({ key, label }) => {
              const sig = packWeights[key]
              return (
                <div key={key} className="feed-subscribed-signal-row">
                  <span className={`feed-subscribed-signal-indicator${sig.enabled ? ' is-on' : ''}`} />
                  <span className={`feed-subscribed-signal-label${sig.enabled ? '' : ' is-off'}`}>{label}</span>
                  <span className={`feed-subscribed-signal-weight${sig.enabled ? '' : ' is-off'}`}>
                    {sig.enabled ? `×${sig.weight}` : 'off'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="feed-sorting-custom-section">
        <p className="sidebar-block-title">Raw expression</p>
        <textarea
          className="feed-sorting-custom-expr"
          rows={6}
          value={JSON.stringify(expr, null, 2)}
          readOnly
        />
        <p className="card-hint">
          Formula text: <code>{exprToFormula(expr, variant === 'personalization' ? PERSONALIZATION_FIELDS : FORMULA_FIELDS)}</code>
        </p>
      </div>
    </div>
  )
}
