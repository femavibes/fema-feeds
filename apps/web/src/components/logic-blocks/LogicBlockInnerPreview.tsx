import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { LogicBlockPackage } from '@cfb/core-types'
import { normalizeRuleGroup } from '@cfb/l2-graph'

import { api } from '../../api/client'
import { logicBlockToFeedDraft } from '../../lib/logic-block-editor'
import { DEFAULT_RAIL_WIDTHS } from '../../hooks/useVisualEditorRails'
import { L2GraphCanvas } from '../l2/visual/L2GraphCanvas'
import { L2PropertiesInspector } from '../l2/visual/L2NodeInspector'
import { MobileSheetHandle } from '../l2/visual/MobileSheetHandle'
import { RailCollapseStrip, RailPanelHead } from '../l2/visual/L2RailChrome'
import { PropertiesHelpModal } from '../l2/visual/PropertiesHelpModal'
import { findInMatch } from '../../lib/l2-form'

interface Props {
  packageId: string
  versionPin: string
  title?: string
  onClose: () => void
}

const COLLAPSED_PROPS_W = '40px'

const CANVAS_HINT =
  "Read-only preview of this block's inner logic. Separate paths from START are OR; nodes chained on one path are AND."

export function LogicBlockInnerPreview({ packageId, versionPin, title, onClose }: Props) {
  // Own open state — do not share the main editor's session-backed rails, or
  // the preview inherits "props open" and opens as a side panel / sheet.
  const [propsOpen, setPropsOpen] = useState(false)
  const [propertiesHelpOpen, setPropertiesHelpOpen] = useState(false)
  const [pkg, setPkg] = useState<LogicBlockPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const toggleProps = useCallback(() => setPropsOpen((open) => !open), [])

  useEffect(() => {
    setPkg(null)
    setError(null)
    setSelectedId(null)
    setSelectedEdgeId(null)
    void api
      .getLogicBlock(packageId, versionPin)
      .then((res) => setPkg(res.package))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load logic block'))
  }, [packageId, versionPin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const draft = useMemo(() => (pkg ? logicBlockToFeedDraft(pkg) : null), [pkg])
  const match = useMemo(() => (draft ? normalizeRuleGroup(draft.match) : null), [draft])
  const positions = draft?.visualLayout?.positions ?? {}
  const canvasEdges = draft?.visualLayout?.edges ?? []
  const nodeLabels = draft?.visualLayout?.labels ?? {}
  const nodeSources = draft?.visualLayout?.nodeSources ?? {}

  const noop = useCallback(() => {}, [])

  const openPropertiesForNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setPropsOpen(true)
  }, [])

  const gridStyle = useMemo(
    () =>
      ({
        '--l2-props-w': propsOpen ? `${DEFAULT_RAIL_WIDTHS.props}px` : COLLAPSED_PROPS_W,
      }) as CSSProperties,
    [propsOpen],
  )

  const label = title ?? pkg?.name ?? 'Logic block preview'

  return (
    <div
      className="l2-visual-fullscreen l2-visual-fullscreen--nested l2-logic-block-inner-preview"
      style={gridStyle}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <header className="l2-visual-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{label}</h2>
          <span className="l2-visual-toolbar-sub">
            {pkg ? `Logic block · v${pkg.version} · read-only` : 'Loading…'}
          </span>
        </div>
        <div className="l2-visual-toolbar-actions">
          <span className="l2-visual-hint" title="Keyboard shortcuts">
            Esc
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close preview
          </button>
        </div>
      </header>

      <p className="l2-visual-canvas-hint" aria-hidden="true">
        {CANVAS_HINT}
      </p>

      <main className="l2-visual-main">
        {error ? (
          <p className="field-error l2-logic-block-inner-preview-status">{error}</p>
        ) : !draft || !match ? (
          <p className="logic-block-inner-preview-loading l2-logic-block-inner-preview-status">
            Loading logic block…
          </p>
        ) : (
          <ReactFlowProvider>
            <L2GraphCanvas
              readOnly
              match={match}
              positions={positions}
              canvasEdges={canvasEdges}
              selectedId={selectedId}
              selectedEdgeId={selectedEdgeId}
              testTrace={null}
              onSelect={setSelectedId}
              onSelectEdge={setSelectedEdgeId}
              onPositionsChange={noop}
              onEdgesChange={noop}
              onMatchReorder={noop}
              nodeLabels={nodeLabels}
              nodeSources={nodeSources}
              onNodeContextMenu={noop}
              onEdgeContextMenu={noop}
              onReparent={noop}
              onExtract={noop}
              onPaletteDrop={noop}
              onNodeOpenProperties={openPropertiesForNode}
            />
          </ReactFlowProvider>
        )}
      </main>

      <aside className={`l2-visual-rail l2-visual-rail-props${propsOpen ? ' is-open' : ''}`}>
        {propsOpen ? (
          <>
            <MobileSheetHandle onClose={toggleProps} />
            <RailPanelHead
              title="Properties"
              onCollapse={toggleProps}
              collapseLabel="Collapse properties"
              onHelp={() => setPropertiesHelpOpen(true)}
              helpLabel="About this node"
            />
            {draft && match ? (
              <L2PropertiesInspector
                match={match}
                draft={draft}
                nodeLabels={nodeLabels}
                selectedId={selectedId}
                selectedEdgeId={selectedEdgeId}
                canvasEdges={canvasEdges}
                onChange={noop}
                onDeleteSelected={noop}
                readOnly
              />
            ) : (
              <p className="card-hint l2-logic-block-inner-preview-props-hint">Loading…</p>
            )}
          </>
        ) : (
          <RailCollapseStrip
            label="Props"
            expandLabel="Show properties"
            onExpand={toggleProps}
          />
        )}
      </aside>

      <PropertiesHelpModal
        open={propertiesHelpOpen}
        onClose={() => setPropertiesHelpOpen(false)}
        context={{
          selected: match && selectedId ? findInMatch(match, selectedId) : null,
          selectedEdgeId,
        }}
      />

      <div className="l2-visual-mobile-bar">
        <button
          type="button"
          className={propsOpen ? 'active' : undefined}
          onClick={toggleProps}
        >
          Properties
        </button>
      </div>
    </div>
  )
}
