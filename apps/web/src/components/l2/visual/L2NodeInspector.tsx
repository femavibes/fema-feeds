import { useEffect, useRef, useState } from 'react'
import type { FeedConfig, L2GroupLogic, L2NodeProvenance, L2NodeTrace, L2RuleGroup, L2RuleNode, AuthorListConfig, FeedAuthorListConfig, L2AuthorCondition, LogicBlockPackage } from '@cfb/core-types'

import type { ListCacheEntry } from '../../../api/client'

import {

  L2_GROUP_LOGIC,

  collectFeedAuthorListReferences,

  findInMatch,

  updateGroup,

  updateInMatch,

} from '../../../lib/l2-form'

import { pruneFeedAuthorLists } from '../../../lib/author-lists'
import {
  ingestRoleBadgeFor,
  nodeRoleBadgeLabel,
  nodeRoleBadgeTitle,
} from '../../../lib/l2-ingest-badge'
import {
  applyParametersToMatch,
  buildParamValueMap,
  collectExcludedNodeIds,
  collectParamControls,
  collectParamListFieldPreviews,
  collectParamPropertyFieldPreviews,
  indexRuleNodesById,
  resolveParamControlMode,
  syncSharedParamControlFromPanel,
} from '@cfb/l2-graph'
import {
  collectParamPropertyLocks,
  overlayParamLockedValues,
  overlayParamOverrideValues,
  paramLockSummary,
  paramLockedPropertySet,
  paramOverridePropertySet,
  paramSearchFieldOverrideSet,
  paramStyleTokensForNode,
  paramPinResetKey,
  paramBoundMemberFieldsForNode,
  restoreParamLockedValues,
  restoreParamOverrideValues,
  isTargetOfAnyParam,
  type EditorParamPreview,
} from '../../../lib/param-bind-preview'
import { ConditionRow } from '../ConditionRow'
import { ScoutSourceEditor, SubstituteSourceEditor } from '../DiscoverySourceEditors'
import { isIngressSourceNodeId } from '@cfb/l2-graph'
import { ingressSourceLabel } from '../../../lib/feed-source-palette'
import { ParamTargetBadge } from '../ParamControlModeModal'
import {
  LogicBlockParamValuesEditor,
  ParametersNodeEditor,
} from '../ParametersNodeEditor'
import { api } from '../../../api/client'

import { LogicBlockInsertPanel } from '../../logic-blocks/LogicBlockInsertPanel'

import { SaveLogicBlockPanel } from '../../logic-blocks/SaveLogicBlockPanel'

import type { CanvasEdge, NodeLabels } from './graph-sync'



function edgeLabel(edges: CanvasEdge[], edgeId: string): string {

  const edge = edges.find((e) => e.id === edgeId)

  if (!edge) return edgeId

  const name = (id: string) => ingressSourceLabel(id)

  return `${name(edge.source)} → ${name(edge.target)}`

}



interface Props {

  match: L2RuleGroup

  draft: FeedConfig

  liveFeed?: FeedConfig | null

  onLiveFeedChange?: (feed: FeedConfig) => void

  nodeLabels: NodeLabels

  selectedId: string | null

  selectedEdgeId: string | null

  canvasEdges: CanvasEdge[]

  onChange: (match: L2RuleGroup) => void

  onDeleteSelected: () => void

  /** When true, hide destructive delete for the selected node. */
  selectedNodeLocked?: boolean

  onRenameNode?: (nodeId: string) => void

  onTestTrace?: (trace: L2NodeTrace[] | null) => void

  onSelectNode?: (id: string) => void

  onDraftChange?: (next: FeedConfig | ((prev: FeedConfig) => FeedConfig)) => void

  onPatchDraft?: (patch: Partial<FeedConfig>) => void

  projectAuthorLists?: AuthorListConfig[]

  listCache?: ListCacheEntry[]

  onRefreshList?: (listId: string) => Promise<void>
  onListsChanged?: () => void | Promise<void>
  prefilterMode?: boolean
  readOnly?: boolean
  onOpenInnerLogicPreview?: (target: {
    packageId: string
    versionPin: string
    title?: string
    updatePolicy?: 'pinned' | 'notify' | 'auto_minor'
  }) => void
  onOpenLogicBlockCompare?: (target: {
    packageId: string
    fromVersion: string
    toVersion: string
    title?: string
  }) => void
  /** Replace a selected group with a logic_block_ref after Save → Use here. */
  onUseLogicBlockHere?: (groupId: string, pkg: LogicBlockPackage) => void
  /** Insert a subscribed/collection logic block into the selected group. */
  onInsertLogicBlock?: (
    targetGroupId: string,
    pkg: LogicBlockPackage,
    versionPin: string,
    provenance: L2NodeProvenance,
  ) => void
  /** Open Parameter control mode modal for this target node. */
  onOpenParamControlMode?: (nodeId: string) => void
  /** Write Live Param values to production (session PATCH). */
  onPatchLiveParamValues?: (values: Record<string, import('@cfb/core-types').L2ParamValue>) => void
  /** Draft Param preview for bound-node overlays (same as canvas expand). */
  editorParamPreview?: EditorParamPreview
}



export function L2PropertiesInspector({

  match,

  draft,

  liveFeed,

  onLiveFeedChange,

  nodeLabels,

  selectedId,

  selectedEdgeId,

  canvasEdges,

  onChange,

  onDeleteSelected,

  selectedNodeLocked = false,

  onRenameNode,

  onDraftChange,

  onPatchDraft,

  projectAuthorLists = [],

  listCache = [],

  onRefreshList,
  onListsChanged,
  prefilterMode = false,
  readOnly = false,
  onOpenInnerLogicPreview,
  onOpenLogicBlockCompare,
  onUseLogicBlockHere,
  onInsertLogicBlock,
  onOpenParamControlMode,
  onPatchLiveParamValues,
  editorParamPreview,
}: Props) {

  const selected = selectedId ? findInMatch(match, selectedId) : null
  const ingressSourceId =
    selectedId && isIngressSourceNodeId(selectedId) ? selectedId : null
  const paramOverrides = editorParamPreview?.overrides

  const effectiveById = indexRuleNodesById(applyParametersToMatch(match, { values: paramOverrides }))
  const paramExcluded = collectExcludedNodeIds(match)
  const effectiveSelected =
    selected && selected.type !== 'group' ? effectiveById.get(selected.id) : undefined
  const paramLocks =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? collectParamPropertyLocks(match, selected.id)
      : []
  const paramListPreviews =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? collectParamListFieldPreviews(match, selected.id, paramOverrides)
      : []
  const paramPropertyPreviews =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? collectParamPropertyFieldPreviews(match, selected.id, paramOverrides)
      : []
  const paramOverrideProps = paramOverridePropertySet(paramPropertyPreviews)
  const pinResetKey =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? paramPinResetKey(match, selected.id, paramOverrides)
      : ''
  const paramBoundSearchFields =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? paramBoundMemberFieldsForNode(match, selected.id, 'fields')
      : new Set<string>()
  const pinnedRef = useRef<Set<string>>(new Set())
  const [pinTick, setPinTick] = useState(0)

  useEffect(() => {
    pinnedRef.current = new Set()
    setPinTick((n) => n + 1)
  }, [selectedId, pinResetKey])

  const pinnedBaselineProps = pinnedRef.current
  const pinnedSearchFields = paramSearchFieldOverrideSet(pinnedBaselineProps)
  const styleTokens =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? paramStyleTokensForNode(match, selected.id, paramOverrides, pinnedBaselineProps)
      : { draft: new Set<string>(), live: new Set<string>() }
  const paramLiveProps = styleTokens.draft
  const paramProductionProps = styleTokens.live
  const displaySelected =
    selected && selected.type !== 'group' && selected.type !== 'parameters'
      ? overlayParamOverrideValues(
          overlayParamLockedValues(selected, effectiveSelected, paramLocks),
          effectiveSelected,
          paramPropertyPreviews,
          pinnedBaselineProps,
        )
      : selected

  void pinTick

  const conditionRoleBadges =
    selected &&
    selected.type !== 'group' &&
    selected.type !== 'logic_block_ref' &&
    selected.type !== 'score' &&
    selected.type !== 'parameters'
      ? ingestRoleBadgeFor(effectiveSelected ?? selected)
      : []

  const [blockParamControls, setBlockParamControls] = useState<
    import('@cfb/core-types').L2ParamControl[]
  >([])

  useEffect(() => {
    if (!selected || selected.type !== 'logic_block_ref') {
      setBlockParamControls([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await api.getLogicBlock(selected.packageId, selected.versionPin)
        if (cancelled) return
        setBlockParamControls(collectParamControls(res.package.root))
      } catch {
        if (!cancelled) setBlockParamControls([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    selected && selected.type === 'logic_block_ref' ? selected.packageId : null,
    selected && selected.type === 'logic_block_ref' ? selected.versionPin : null,
  ])

  const applyAuthorFeedUpdate =
    selected?.type === 'author' && onPatchDraft
      ? (lists: FeedAuthorListConfig[], node: L2AuthorCondition) => {
          const nextMatch = updateInMatch(match, selected.id, node)
          const referenced = collectFeedAuthorListReferences({
            match: nextMatch,
            sources: draft.sources,
          })
          const pruned = pruneFeedAuthorLists(lists, referenced)
          onPatchDraft({
            authorLists: pruned.length ? pruned : undefined,
            match: nextMatch,
          })
        }
      : undefined

  const applyScoutFeedUpdate =
    ingressSourceId === 'scout' && onPatchDraft
      ? (lists: FeedAuthorListConfig[], scout: NonNullable<FeedConfig['sources']>['scout']) => {
          const referenced = collectFeedAuthorListReferences({
            match,
            sources: { ...draft.sources, scout },
          })
          const pruned = pruneFeedAuthorLists(lists, referenced)
          onPatchDraft({
            authorLists: pruned.length ? pruned : undefined,
            sources: { ...draft.sources, scout },
          })
        }
      : undefined

  const canDeleteNode =

    Boolean(selectedId) &&

    selectedId !== 'start' &&

    selectedId !== 'end' &&

    selectedId !== match.id &&

    !selectedNodeLocked

  const canDeleteIngressSource = Boolean(ingressSourceId) && !selectedNodeLocked

  const canDeleteEdge = Boolean(selectedEdgeId)

  const showNodeId = Boolean((selected && selectedId) || ingressSourceId)
  const showFooter =
    showNodeId || (!readOnly && (canDeleteNode || canDeleteIngressSource || canDeleteEdge))



  return (

    <div className="l2-visual-inspector l2-visual-inspector-props">

        <div

          className={`l2-inspector-body scrollbar-modern${

            selected && selected.type !== 'group' ? ' l2-inspector-body--condition' : ''

          }${readOnly ? ' l2-inspector-body--readonly' : ''}`}

        >

            {!selected && !ingressSourceId && !selectedEdgeId && (

              readOnly ? (

                <p className="card-hint">Click a node to inspect its conditions and settings.</p>

              ) : (

              <>
                <div className="l2-inspector-guide">

                  <p className="l2-inspector-guide-title">How paths work</p>

                  <ul className="l2-inspector-guide-list">

                    <li><strong>Separate paths from START</strong> = OR (any route to FEED can qualify)</li>

                    <li><strong>Chain on one path</strong> (START → labels → hashtag → FEED) = AND (every step must pass)</li>

                    <li>Boxes still have their own AND/OR logic for filters inside</li>

                    <li>Right-click a line to disconnect; right-click a node to rename or delete</li>
                    <li>Drag a node to reorder inside a group, drop into another group, or pull it out onto the canvas</li>
                    <li>Drag nodes from the left palette onto the canvas</li>

                    <li>Drag from a node&apos;s dot to draw a new line</li>

                  </ul>

                </div>

                <p className="card-hint">Click the canvas background, then add groups or filters from the palette.</p>

              </>

              )

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



            {ingressSourceId && onPatchDraft ? (
              <div className="l2-inspector-ingress-source">
                <p className="l2-inspector-guide-title">{ingressSourceLabel(ingressSourceId)}</p>
                <p className="card-hint">
                  Ingress source — posts enter here and flow through wired logic to FEED. Edit full
                  config on the Sources tab.
                </p>
                {ingressSourceId === 'scout' && draft.sources?.scout ? (
                  <ScoutSourceEditor
                    value={draft.sources.scout}
                    onChange={(scout) => {
                      if (!onPatchDraft) return
                      const referenced = collectFeedAuthorListReferences({
                        match,
                        sources: { ...draft.sources, scout },
                      })
                      const pruned = pruneFeedAuthorLists(draft.authorLists ?? [], referenced)
                      onPatchDraft({
                        sources: { ...draft.sources, scout },
                        authorLists: pruned.length ? pruned : undefined,
                      })
                    }}
                    onScoutFeedUpdate={applyScoutFeedUpdate}
                    projectId={draft.projectId}
                    feedId={draft.feedId}
                    projectAuthorLists={projectAuthorLists}
                    feedAuthorLists={draft.authorLists ?? []}
                    onFeedAuthorListsChange={
                      onPatchDraft
                        ? (lists) => {
                            const referenced = collectFeedAuthorListReferences({
                              match,
                              sources: draft.sources,
                            })
                            const pruned = pruneFeedAuthorLists(lists, referenced)
                            onPatchDraft({
                              authorLists: pruned.length ? pruned : undefined,
                            })
                          }
                        : undefined
                    }
                    listCache={listCache ?? []}
                    onRefreshList={onRefreshList}
                    onListCacheInvalidate={onListsChanged}
                    readOnly={readOnly}
                  />
                ) : null}
                {ingressSourceId === 'substitute' && draft.sources?.substitute ? (
                  <SubstituteSourceEditor
                    value={draft.sources.substitute}
                    onChange={(substitute) =>
                      onPatchDraft({ sources: { ...draft.sources, substitute } })
                    }
                    readOnly={readOnly}
                  />
                ) : null}
                {ingressSourceId.startsWith('source-') ? (
                  <p className="card-hint">
                    Native pull source — configure project, feed, or URI list on the Sources tab.
                  </p>
                ) : null}
              </div>
            ) : null}



            {selected?.type === 'group' && (

              <>

                {selected.id !== match.id && (

                  readOnly ? (

                    <>

                      <div className="l2-inspector-section-head">

                        <h4>Group</h4>

                      </div>

                      {selected.label ? <p className="card-hint">Label: {selected.label}</p> : null}

                      <p className="card-hint">

                        Logic:{' '}

                        {selected.logic === 'any'

                          ? 'Any — OR'

                          : selected.logic === 'all'

                            ? 'All — AND'

                            : selected.logic === 'n_of'

                              ? `N-of — at least ${selected.minPass ?? 2} pass`

                              : 'NOT (legacy)'}

                      </p>

                      <p className="card-hint">

                        {`${selected.children?.length ?? 0} condition(s) in this group.`}

                      </p>

                    </>

                  ) : (

                  <>

                    <div className="l2-inspector-section-head">

                      <h4>Group</h4>

                      {!readOnly && onRenameNode && selectedId ? (

                        <button

                          type="button"

                          className="l2-inspector-rename btn btn-secondary btn-sm"

                          onClick={() => onRenameNode(selectedId)}

                        >

                          Rename

                        </button>

                      ) : null}

                    </div>

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

                  )

                )}

                {!readOnly ? (
                  <>
                {onUseLogicBlockHere ? (
                  <SaveLogicBlockPanel
                    group={selected}
                    onUseHere={(pkg) => onUseLogicBlockHere(selected.id, pkg)}
                  />
                ) : null}

                {onInsertLogicBlock ? (
                  <LogicBlockInsertPanel
                    onInsert={(pkg, versionPin, provenance) =>
                      onInsertLogicBlock(selected.id, pkg, versionPin, provenance)
                    }
                  />
                ) : null}
                  </>
                ) : null}

              </>

            )}



            {selected?.type === 'logic_block_ref' && (

              <>

                <div className="l2-inspector-section-head">

                  <h4>Logic block</h4>

                  {!readOnly && onRenameNode && selectedId ? (

                    <button

                      type="button"

                      className="l2-inspector-rename btn btn-secondary btn-sm"

                      onClick={() => onRenameNode(selectedId)}

                    >

                      Rename

                    </button>

                  ) : null}

                </div>

                <p className="card-hint">

                  <strong>{nodeLabels[selected.id]?.trim() || (selected.label ?? 'Custom logic')}</strong>
                  {(selected.updatePolicy ?? 'notify') === 'auto_minor'
                    ? ` — feed pin v${selected.versionPin}; eval uses latest patch in this minor.`
                    : ` — using v${selected.versionPin}.`}

                </p>

                {!readOnly && onOpenInnerLogicPreview ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    onOpenInnerLogicPreview({
                      packageId: selected.packageId,
                      versionPin: selected.versionPin,
                      updatePolicy: selected.updatePolicy,
                      title: selected.label ?? nodeLabels[selected.id]?.trim() ?? undefined,
                    })
                  }
                >
                  View inner logic
                </button>
                ) : null}

                {!readOnly && onOpenLogicBlockCompare ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    onOpenLogicBlockCompare({
                      packageId: selected.packageId,
                      fromVersion: selected.versionPin,
                      toVersion: selected.versionPin,
                      title: selected.label ?? nodeLabels[selected.id]?.trim() ?? undefined,
                    })
                  }
                >
                  Compare versions…
                </button>
                ) : null}

                {!readOnly ? (
                <label className="l2-inspector-field">

                  Update policy

                  <select

                    value={selected.updatePolicy ?? 'notify'}

                    onChange={(e) =>

                      onChange(

                        updateInMatch(match, selected.id, {

                          ...selected,

                          updatePolicy: e.target.value as 'pinned' | 'notify' | 'auto_minor',

                        }),

                      )

                    }

                  >

                    <option value="notify">Notify — alert when a newer version exists</option>

                    <option value="auto_minor">Auto minor — follow patch updates (1.0.x) automatically</option>

                    <option value="pinned">Quiet — stay on v{selected.versionPin}, no upgrade alerts</option>

                  </select>

                </label>
                ) : null}

                <div className="l2-inspector-section-head">
                  <h4>Parameters</h4>
                </div>
                <LogicBlockParamValuesEditor
                  controls={blockParamControls}
                  values={selected.paramValues ?? {}}
                  readOnly={readOnly}
                  onChange={(paramValues) =>
                    onChange(updateInMatch(match, selected.id, { ...selected, paramValues }))
                  }
                />

              </>

            )}

            {selected?.type === 'parameters' && (
              <>
                <div className="l2-inspector-section-head">
                  <h4>Parameters</h4>
                  {!readOnly && onRenameNode && selectedId ? (
                    <button
                      type="button"
                      className="l2-inspector-rename btn btn-secondary btn-sm"
                      onClick={() => onRenameNode(selectedId)}
                    >
                      Rename
                    </button>
                  ) : null}
                </div>
                <ParametersNodeEditor
                  node={selected}
                  match={match}
                  nodeLabels={nodeLabels}
                  feedId={draft.feedId}
                  feedTimezone={draft.timezone ?? 'UTC'}
                  onFeedTimezoneChange={
                    onPatchDraft
                      ? (timezone) => onPatchDraft({ timezone: timezone.trim() || 'UTC' })
                      : undefined
                  }
                  readOnly={readOnly}
                  onPatchLiveParamValues={onPatchLiveParamValues}
                  onChange={(next) => {
                    const updated = updateInMatch(match, selected.id, next)
                    onChange(syncSharedParamControlFromPanel(updated, selected.id))
                  }}
                />
              </>
            )}

            {selected && selected.type === 'score' && (
              <>
                <div className="l2-inspector-section-head">
                  <h4>Score node</h4>
                  {!readOnly && onRenameNode && selectedId ? (
                    <button
                      type="button"
                      className="l2-inspector-rename btn btn-secondary btn-sm"
                      onClick={() => onRenameNode(selectedId)}
                    >
                      Rename
                    </button>
                  ) : null}
                </div>
                {!readOnly ? (
                <label className="l2-inspector-field">
                  Points
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={selected.points}
                    onChange={(e) => {
                      const points = Math.max(1, parseInt(e.target.value) || 1)
                      onChange(updateInMatch(match, selected.id, { ...selected, points }))
                    }}
                  />
                </label>
                ) : (
                  <p className="l2-inspector-readonly">+{selected.points} points</p>
                )}
                <p className="l2-inspector-hint">
                  Posts passing through this node accumulate +{selected.points} editorial score. Score always sticks even if the path fails later.
                </p>
              </>
            )}

            {selected && selected.type !== 'group' && selected.type !== 'logic_block_ref' && selected.type !== 'score' && selected.type !== 'parameters' && (

              <div className="l2-inspector-condition">

                <div className="l2-inspector-section-head">

                  <h4>Condition</h4>

                  <div className="l2-inspector-section-head-trailing">
                    {isTargetOfAnyParam(match, selected.id) && onOpenParamControlMode ? (
                      <>
                        <ParamTargetBadge
                          onClick={() => onOpenParamControlMode(selected.id)}
                        />
                        <span className="l2-param-mode-chip" title="How Parameters control bound fields on this node">
                          {resolveParamControlMode(selected) === 'full_control'
                            ? 'Full control'
                            : 'Override when on'}
                        </span>
                      </>
                    ) : null}
                    {!readOnly && onRenameNode && selectedId ? (

                      <button

                        type="button"

                        className="l2-inspector-rename btn btn-secondary btn-sm"

                        onClick={() => onRenameNode(selectedId)}

                      >

                        Rename

                      </button>

                    ) : null}
                  </div>

                </div>

                {conditionRoleBadges.length > 0 ? (
                  <div className="l2-inspector-role-badges" aria-label="Node roles">
                    {conditionRoleBadges.map((role) => (
                      <span
                        key={role}
                        className={`l2-ingest-role-badge l2-ingest-role-badge--${role}`}
                        title={nodeRoleBadgeTitle(role)}
                      >
                        {nodeRoleBadgeLabel(role)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {paramExcluded.has(selected.id) ? (
                  <p className="l2-param-lock-banner">
                    Removed by a Parameter Presence bind — greyed on the canvas until that control is on.
                  </p>
                ) : null}

                <ConditionRow

                  node={displaySelected ?? selected}

                  onChange={(next: L2RuleNode) => {
                    const locked = restoreParamLockedValues(next, selected, paramLocks)
                    const authored = restoreParamOverrideValues(
                      locked,
                      selected,
                      paramOverrideProps,
                      displaySelected ?? selected,
                    )
                    const nextMatch = updateInMatch(match, selected.id, authored)
                    if (authored.type === 'author' && onPatchDraft) {
                      const referenced = collectFeedAuthorListReferences({
                        match: nextMatch,
                        sources: draft.sources,
                      })
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

                  fillHeight={!readOnly && selected.type === 'keyword'}

                  paramLockedProps={paramLockedPropertySet(paramLocks)}

                  paramLockHint={paramLocks.length ? paramLockSummary(paramLocks) : undefined}

                  paramListPreviews={paramListPreviews}
                  paramOverriddenProps={paramLiveProps}
                  paramProductionProps={paramProductionProps}
                  paramBoundSearchFields={paramBoundSearchFields}
                  pinnedSearchFields={pinnedSearchFields}
                  baselineNode={selected}
                  onPinParamBaseline={(property) => {
                    if (pinnedRef.current.has(property)) {
                      pinnedRef.current.delete(property)
                    } else {
                      pinnedRef.current.add(property)
                    }
                    setPinTick((n) => n + 1)
                  }}

                  projectAuthorLists={projectAuthorLists}

                  feedAuthorLists={draft.authorLists ?? []}

                  onAuthorFeedUpdate={applyAuthorFeedUpdate}

                  onFeedAuthorListsChange={
                    onPatchDraft
                      ? (lists) => {
                          const referenced = collectFeedAuthorListReferences({
                            match,
                            sources: draft.sources,
                          })
                          const pruned = pruneFeedAuthorLists(lists, referenced)
                          onPatchDraft({
                            authorLists: pruned.length ? pruned : undefined,
                          })
                        }
                      : onDraftChange
                        ? (lists) => {
                            const referenced = collectFeedAuthorListReferences({
                              match,
                              sources: draft.sources,
                            })
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

                  feedId={draft.feedId}

                  onRefreshList={onRefreshList}

                  onListsChanged={onListsChanged}

                  prefilterMode={prefilterMode}

                  readOnly={readOnly}

                />

              </div>

            )}

          </div>



          {showFooter ? (
            <footer className="l2-inspector-footer sidebar-footer">
              {showNodeId ? (
                <div className="l2-inspector-footer-id">
                  <code className="mono l2-inspector-node-id" title={selectedId ?? undefined}>
                    {selectedId}
                  </code>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => selectedId && void navigator.clipboard.writeText(selectedId)}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <span />
              )}
              {!readOnly && (canDeleteNode || canDeleteEdge) ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={onDeleteSelected}>
                  {canDeleteEdge ? 'Disconnect line' : 'Delete node'}
                </button>
              ) : null}
            </footer>
          ) : null}

    </div>

  )

}

export { L2PropertiesInspector as L2NodeInspector }
