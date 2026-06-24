import type { FeedConfig, L2GroupLogic, L2NodeTrace, L2RuleGroup, L2RuleNode, AuthorListConfig, FeedAuthorListConfig, L2AuthorCondition } from '@cfb/core-types'

import type { ListCacheEntry } from '../../../api/client'

import {

  L2_GROUP_LOGIC,

  collectAuthorListIdsFromMatch,

  findInMatch,

  updateGroup,

  updateInMatch,

} from '../../../lib/l2-form'

import { pruneFeedAuthorLists } from '../../../lib/author-lists'

import { ConditionRow } from '../ConditionRow'

import { LogicBlockInsertPanel } from '../../logic-blocks/LogicBlockInsertPanel'

import { SaveLogicBlockPanel } from '../../logic-blocks/SaveLogicBlockPanel'

import type { CanvasEdge, NodeLabels } from './graph-sync'



function edgeLabel(edges: CanvasEdge[], edgeId: string): string {

  const edge = edges.find((e) => e.id === edgeId)

  if (!edge) return edgeId

  const name = (id: string) => {

    if (id === 'start') return 'START'

    if (id === 'end') return 'FEED'

    return id

  }

  return `${name(edge.source)} → ${name(edge.target)}`

}



interface Props {

  match: L2RuleGroup

  draft: FeedConfig

  nodeLabels: NodeLabels

  selectedId: string | null

  selectedEdgeId: string | null

  canvasEdges: CanvasEdge[]

  onChange: (match: L2RuleGroup) => void

  onLabelsChange: (labels: NodeLabels) => void

  onDeleteSelected: () => void

  onRenameNode: (nodeId: string) => void

  onTestTrace?: (trace: L2NodeTrace[] | null) => void

  onSelectNode?: (id: string) => void

  onDraftChange?: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void

  onPatchDraft?: (patch: Partial<FeedConfig>) => void

  projectAuthorLists?: AuthorListConfig[]

  listCache?: ListCacheEntry[]

  onRefreshList?: (listId: string) => Promise<void>
  prefilterMode?: boolean
}



export function L2PropertiesInspector({

  match,

  draft,

  nodeLabels,

  selectedId,

  selectedEdgeId,

  canvasEdges,

  onChange,

  onLabelsChange,

  onDeleteSelected,

  onRenameNode,

  onDraftChange,

  onPatchDraft,

  projectAuthorLists = [],

  listCache = [],

  onRefreshList,
  prefilterMode = false,
}: Props) {

  const selected = selectedId ? findInMatch(match, selectedId) : null

  const applyAuthorFeedUpdate =
    selected?.type === 'author' && onPatchDraft
      ? (lists: FeedAuthorListConfig[], node: L2AuthorCondition) => {
          const nextMatch = updateInMatch(match, selected.id, node)
          const referenced = collectAuthorListIdsFromMatch(nextMatch)
          const pruned = pruneFeedAuthorLists(lists, referenced)
          onPatchDraft({
            authorLists: pruned.length ? pruned : undefined,
            match: nextMatch,
          })
        }
      : undefined

  const canDeleteNode =

    Boolean(selectedId) &&

    selectedId !== 'start' &&

    selectedId !== 'end' &&

    selectedId !== match.id

  const canDeleteEdge = Boolean(selectedEdgeId)

  const showFooter = canDeleteNode || canDeleteEdge



  return (

    <div className="l2-visual-inspector l2-visual-inspector-props">

        <div

          className={`l2-inspector-body${

            selected && selected.type !== 'group' ? ' l2-inspector-body--condition' : ''

          }`}

        >

            {!selected && !selectedEdgeId && (

              <>

                <div className="l2-inspector-guide">

                  <p className="l2-inspector-guide-title">How paths work</p>

                  <ul className="l2-inspector-guide-list">

                    <li><strong>Separate paths from START</strong> = OR (any route to FEED can qualify)</li>

                    <li><strong>Chain on one path</strong> (START → labels → hashtag → FEED) = AND (every step must pass)</li>

                    <li>Boxes still have their own AND/OR logic for filters inside</li>

                    <li>Right-click a line to disconnect; right-click a node to rename or delete</li>
                    <li>Drag the top-right grip (or Alt+drag) to move a node out of a group</li>
                    <li>Drag nodes from the left palette onto the canvas</li>

                    <li>Drag from a node&apos;s dot to draw a new line</li>

                  </ul>

                </div>

                <p className="card-hint">Click the canvas background, then add groups or filters from the palette.</p>

              </>

            )}



            {selectedEdgeId && (

              <div className="l2-inspector-edge">

                <p className="l2-inspector-guide-title">Connection</p>

                <p className="card-hint">{edgeLabel(canvasEdges, selectedEdgeId)}</p>

                <p className="card-hint">

                  Disconnect this line, then draw START → A → B → FEED to require both A and B on that route.

                </p>

              </div>

            )}



            {selected?.type === 'group' && (

              <>

                {selected.id !== match.id && (

                  <>

                    <h4>Group</h4>

                    <label className="l2-inspector-field">

                      Display name

                      <input

                        value={selected.label ?? ''}

                        onChange={(e) =>

                          onChange(

                            updateGroup(match, selected.id, (g) => ({

                              ...g,

                              label: e.target.value || undefined,

                            })),

                          )

                        }

                        onBlur={(e) => {

                          const trimmed = e.target.value.trim()

                          if (trimmed !== (selected.label ?? '')) {

                            onChange(

                              updateGroup(match, selected.id, (g) => ({

                                ...g,

                                label: trimmed || undefined,

                              })),

                            )

                          }

                        }}

                        placeholder="Optional label on canvas"

                      />

                    </label>

                    <label className="l2-inspector-field">

                      Logic

                      <select

                        value={selected.logic}

                        onChange={(e) =>

                          onChange(

                            updateGroup(match, selected.id, (g) => ({

                              ...g,

                              logic: e.target.value as L2GroupLogic,

                            })),

                          )

                        }

                      >

                        {(selected.logic === 'none'

                          ? L2_GROUP_LOGIC

                          : L2_GROUP_LOGIC.filter((l) => l !== 'none')

                        ).map((l) => (

                          <option key={l} value={l}>

                            {l === 'any'

                              ? 'Any — OR'

                              : l === 'all'

                                ? 'All — AND'

                                : l === 'n_of'

                                  ? `N-of — at least ${selected.minPass ?? 2} pass`

                                  : 'NOT (legacy)'}

                          </option>

                        ))}

                      </select>

                    </label>

                    {selected.logic === 'n_of' && (

                      <label className="l2-inspector-field">

                        Minimum passing children (N)

                        <input

                          type="number"

                          min={1}

                          max={99}

                          value={selected.minPass ?? 2}

                          onChange={(e) =>

                            onChange(

                              updateGroup(match, selected.id, (g) => ({

                                ...g,

                                minPass: Math.max(1, Number(e.target.value) || 1),

                              })),

                            )

                          }

                        />

                      </label>

                    )}

                    <p className="card-hint">

                      {`${selected.children?.length ?? 0} condition(s) in this group.`}

                    </p>

                  </>

                )}

                <SaveLogicBlockPanel group={selected} />

                <LogicBlockInsertPanel

                  targetGroupId={selected.id}

                  match={match}

                  onInsert={onChange}

                />

              </>

            )}



            {selected?.type === 'logic_block_ref' && (

              <>

                <h4>Logic block</h4>

                <label className="l2-inspector-field">

                  Display name

                  <input

                    value={nodeLabels[selected.id] ?? ''}

                    onChange={(e) => {

                      const labels = { ...nodeLabels }

                      const raw = e.target.value

                      if (raw) labels[selected.id] = raw

                      else delete labels[selected.id]

                      onLabelsChange(labels)

                    }}

                    onBlur={(e) => {

                      const trimmed = e.target.value.trim()

                      const labels = { ...nodeLabels }

                      if (trimmed) labels[selected.id] = trimmed

                      else delete labels[selected.id]

                      onLabelsChange(labels)

                    }}

                    placeholder={selected.label ?? 'Custom logic'}

                  />

                </label>

                <p className="card-hint">

                  <strong>{selected.label ?? 'Custom logic'}</strong> — pinned at v{selected.versionPin}.

                </p>

                <code className="mono logic-block-ref-id">{selected.packageId}</code>

                <label className="l2-inspector-field">

                  Update policy

                  <select

                    value={selected.updatePolicy ?? 'pinned'}

                    onChange={(e) =>

                      onChange(

                        updateInMatch(match, selected.id, {

                          ...selected,

                          updatePolicy: e.target.value as 'pinned' | 'notify' | 'auto_minor',

                        }),

                      )

                    }

                  >

                    <option value="pinned">Pinned — always use v{selected.versionPin} in this feed</option>

                    <option value="notify">Notify — show upgrade prompts when newer versions exist</option>

                    <option value="auto_minor">Auto minor — eval uses latest patch (1.0.x) automatically</option>

                  </select>

                </label>

              </>

            )}



            {selected && selected.type !== 'group' && selected.type !== 'logic_block_ref' && (

              <div className="l2-inspector-condition">

                <h4>Condition</h4>

                <label className="l2-inspector-field">

                  Display name

                  <input

                    value={nodeLabels[selected.id] ?? ''}

                    onChange={(e) => {

                      const labels = { ...nodeLabels }

                      const raw = e.target.value

                      if (raw) labels[selected.id] = raw

                      else delete labels[selected.id]

                      onLabelsChange(labels)

                    }}

                    onBlur={(e) => {

                      const trimmed = e.target.value.trim()

                      const labels = { ...nodeLabels }

                      if (trimmed) labels[selected.id] = trimmed

                      else delete labels[selected.id]

                      onLabelsChange(labels)

                    }}

                    placeholder="Optional label on canvas"

                  />

                </label>

                <ConditionRow

                  node={selected}

                  onChange={(next: L2RuleNode) => {
                    const nextMatch = updateInMatch(match, selected.id, next)
                    if (next.type === 'author' && onPatchDraft) {
                      const referenced = collectAuthorListIdsFromMatch(nextMatch)
                      const pruned = pruneFeedAuthorLists(draft.authorLists ?? [], referenced)
                      onPatchDraft({
                        match: nextMatch,
                        authorLists: pruned.length ? pruned : undefined,
                      })
                      return
                    }
                    onChange(nextMatch)
                  }}

                  onRemove={onDeleteSelected}

                  showRemove={false}

                  fillHeight={selected.type === 'keyword'}

                  projectAuthorLists={projectAuthorLists}

                  feedAuthorLists={draft.authorLists ?? []}

                  onAuthorFeedUpdate={applyAuthorFeedUpdate}

                  onFeedAuthorListsChange={
                    onPatchDraft
                      ? (lists) => {
                          const referenced = collectAuthorListIdsFromMatch(match)
                          const pruned = pruneFeedAuthorLists(lists, referenced)
                          onPatchDraft({
                            authorLists: pruned.length ? pruned : undefined,
                          })
                        }
                      : onDraftChange
                        ? (lists) => {
                            const referenced = collectAuthorListIdsFromMatch(match)
                            const pruned = pruneFeedAuthorLists(lists, referenced)
                            onDraftChange((prev) => ({
                              ...prev,
                              authorLists: pruned.length ? pruned : undefined,
                            }))
                          }
                        : undefined
                  }

                  listCache={listCache}

                  projectId={draft.projectId}

                  onRefreshList={onRefreshList}

                  prefilterMode={prefilterMode}

                />

              </div>

            )}

          </div>



          {showFooter ? (

            <footer className="l2-inspector-footer sidebar-footer">

              {canDeleteNode && selectedId ? (

                <button

                  type="button"

                  className="btn btn-ghost btn-sm"

                  onClick={() => onRenameNode(selectedId)}

                >

                  Rename…

                </button>

              ) : null}

              <button type="button" className="btn btn-danger btn-sm" onClick={onDeleteSelected}>

                {canDeleteEdge ? 'Disconnect line' : 'Delete node'}

              </button>

            </footer>

          ) : null}

    </div>

  )

}

export { L2PropertiesInspector as L2NodeInspector }
