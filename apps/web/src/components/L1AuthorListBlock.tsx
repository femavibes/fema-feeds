import type { AuthorListConfig, L1StepId } from '@cfb/core-types'
import type { ListCacheEntry } from '../api/client'
import {
  LISTED_AUTHOR_FILTER_GROUPS,
  listedAuthorPolicySummary,
  listedAuthorRequiresStep,
  setListedAuthorRequiresStep,
  stepLabel,
} from '../lib/l1-form'
import { listManualDids, listSourceUri } from '../lib/author-lists'
import { AuthorDidListEditor } from './l2/AuthorDidListEditor'
import { AuthorListMembersPanel } from './l2/AuthorListMembersPanel'
import { AuthorListSourceSummary } from './l2/AuthorListSourceSummary'

interface Props {
  list: AuthorListConfig
  cache?: ListCacheEntry
  onChange: (list: AuthorListConfig) => void
  onRemove: () => void
  onRefreshList?: (listId: string) => Promise<void>
}

function listDisplayTitle(listId: string, cache?: ListCacheEntry): string {
  return cache?.graphName?.trim() || listId
}

export function L1AuthorListBlock({ list, cache, onChange, onRemove, onRefreshList }: Props) {
  const uri = listSourceUri(list)

  const toggleListedAuthorRequires = (step: L1StepId, required: boolean) => {
    onChange(setListedAuthorRequiresStep(list, step, required))
  }

  return (
    <div className="author-list-block card">
      <div className="author-list-head">
        <AuthorListSourceSummary title={listDisplayTitle(list.listId, cache)} uri={uri || undefined} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
          Remove
        </button>
      </div>

      <label>
        List name
        <input
          value={list.listId}
          onChange={(e) => onChange({ ...list, listId: e.target.value.trim() })}
          placeholder="e.g. reporters"
        />
      </label>
      <p className="card-hint">
        Short label for this project — use the same name when you reference this list in feed rules.
      </p>

      <label>
        Bluesky list or starter-pack URL
        <input
          className="mono"
          value={uri}
          onChange={(e) =>
            onChange({
              ...list,
              sources: [{ type: 'bluesky_list', uri: e.target.value, pollIntervalMinutes: 60 }],
            })
          }
          placeholder="https://bsky.app/profile/…/lists/…"
        />
      </label>

      <AuthorDidListEditor
        label="Additional DIDs (optional)"
        dids={listManualDids(list)}
        onChange={(dids) =>
          onChange({
            ...list,
            dids: dids.length ? dids : undefined,
            sources: (list.sources ?? []).filter((s) => s.type !== 'manual_dids'),
          })
        }
        hint="Unioned with the Bluesky list at refresh and evaluation time."
      />

      <AuthorListMembersPanel
        listId={list.listId}
        extraDids={listManualDids(list)}
        cache={cache}
        onRefreshList={onRefreshList}
      />

      <div className="listed-author-policy">
        <p className="listed-author-policy-head">For authors on this list</p>
        <p className="listed-author-policy-summary">{listedAuthorPolicySummary(list)}</p>
        <p className="card-hint">
          Moderation labels and post kind always apply. Check a filter below only if listed authors
          should have to pass it (same as everyone else on the firehose).
        </p>
        <div className="fast-path-groups">
          {LISTED_AUTHOR_FILTER_GROUPS.map((group) => (
            <div key={group.title} className="fast-path-group">
              <p className="fast-path-group-title">{group.title}</p>
              {group.hint && <p className="card-hint">{group.hint}</p>}
              <div className="bypass-grid">
                {group.steps.map((step) => (
                  <label key={step} className="checkbox checkbox-sm">
                    <input
                      type="checkbox"
                      checked={listedAuthorRequiresStep(list, step)}
                      onChange={(e) => toggleListedAuthorRequires(step, e.target.checked)}
                    />
                    Require: {stepLabel(step)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
