import type { L2RuleGroup, L2RuleNode } from '@cfb/core-types'
import {
  newAndGroup,
  newAuthorCondition,
  newCompareCondition,
  newEmbedCondition,
  newHashtagCondition,
  newKeywordCondition,
  newLabelsCondition,
  newLanguageCondition,
  newNOfGroup,
  newOrGroup,
  newPostKindCondition,
  newRegexCondition,
} from '../../lib/l2-form'
import { ConditionRow } from './ConditionRow'

interface Props {
  group: L2RuleGroup
  onChange: (group: L2RuleGroup) => void
  isRoot?: boolean
  /** When set, root AND/OR is defined by the visual canvas — hide the legacy root logic control. */
  canvasWired?: boolean
}

export function RuleGroupEditor({ group, onChange, isRoot, canvasWired }: Props) {
  const setChild = (index: number, child: L2RuleNode) => {
    const children = [...group.children]
    children[index] = child
    onChange({ ...group, children })
  }

  const removeChild = (nodeId: string) => {
    onChange({
      ...group,
      children: group.children.filter((c) => c.id !== nodeId),
    })
  }

  const addChild = (node: L2RuleNode) => {
    onChange({ ...group, children: [...group.children, node] })
  }

  return (
    <div className={`l2-group ${isRoot ? 'l2-group-root' : ''}`}>
      <div className="l2-group-head">
        <span className="l2-group-label">{isRoot ? 'Match rules' : 'Group'}</span>
        {!(isRoot && canvasWired) && (
          <>
            <select
              value={group.logic}
              onChange={(e) => onChange({ ...group, logic: e.target.value as L2RuleGroup['logic'] })}
              aria-label="Group logic"
            >
              <option value="all">All must match (AND)</option>
              <option value="any">Any can match (OR)</option>
              <option value="n_of">N-of (at least N children pass)</option>
              {group.logic === 'none' && (
                <option value="none">NOT (legacy)</option>
              )}
            </select>
            {group.logic === 'n_of' && (
              <label className="l2-n-of-field">
                N
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={group.minPass ?? 2}
                  onChange={(e) =>
                    onChange({ ...group, minPass: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </label>
            )}
          </>
        )}
      </div>

      {isRoot && canvasWired && (
        <p className="card-hint">
          Path logic is defined in the <strong>visual editor</strong> — separate lines from START are OR;
          nodes chained on one line are AND. Groups here still use their own AND/OR inside the box.
        </p>
      )}

      {isRoot && !canvasWired && (
        <p className="card-hint">
          Graze-style nesting: add <strong>AND</strong> / <strong>OR</strong> groups inside each other.
          Root is usually <strong>AND</strong> — every top-level block must pass.
        </p>
      )}

      <div className="l2-children">
        {group.children.map((child, i) =>
          child.type === 'group' ? (
            <div key={child.id} className="l2-nested-group">
              <RuleGroupEditor group={child} onChange={(next) => setChild(i, next)} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeChild(child.id)}
              >
                Remove group
              </button>
            </div>
          ) : (
            <ConditionRow
              key={child.id}
              node={child}
              onChange={(next) => setChild(i, next)}
              onRemove={() => removeChild(child.id)}
            />
          ),
        )}
      </div>

      <div className="l2-add-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newAndGroup())}>
          + AND group
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newOrGroup())}>
          + OR group
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newNOfGroup(2))}>
          + N-of group
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newKeywordCondition())}>
          + Keyword
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newRegexCondition())}>
          + Regex
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newHashtagCondition())}>
          + Hashtag
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newLanguageCondition())}>
          + Language
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newEmbedCondition())}>
          + Embed
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newPostKindCondition())}>
          + Post type
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newLabelsCondition())}>
          + Labels
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newCompareCondition())}>
          + Math
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addChild(newAuthorCondition())}>
          + Author
        </button>
      </div>
    </div>
  )
}
