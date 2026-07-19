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
  "Read-only preview of this block's inner logic. The packaged root is shown as a group frame so AND/OR nesting is visible."

type PreviewView = 'visual' | 'json'

export function LogicBlockInnerPreview({ packageId, versionPin, title, onClose }: Props) {
  // Own open state — do not share the main editor's session-backed rails, or
  // the preview inherits "props open" and opens as a side panel / sheet.
  const [propsOpen, setPropsOpen] = useState(false)
  const [propertiesHelpOpen, setPropertiesHelpOpen] = useState(false)
  const [pkg, setPkg] = useState<LogicBlockPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [view, setView] = useState<PreviewView>('visual')
  const [copyFlash, setCopyFlash] = useState<string | null>(null)

  const toggleProps = useCallback(() => setPropsOpen((open) => !open), [])

  useEffect(() => {
    setPkg(null)
    setError(null)
    setSelectedId(null)
    setSelectedEdgeId(null)
    setView('visual')
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

  /** Packaged logic JSON (not the preview wrapper used for the canvas). */
  const logicJson = useMemo(() => {
    if (!pkg) return ''
    return JSON.stringify(
      {
        id: pkg.id,
        name: pkg.name,
        version: pkg.version,
        root: pkg.root,
      },
      null,
      2,
    )
  }, [pkg])

  const noop = useCallback(() => {}, [])

  const openPropertiesForNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setPropsOpen(true)
  }, [])

  const flash = useCallback((msg: string) => {
    setCopyFlash(msg)
    window.setTimeout(() => setCopyFlash((cur) => (cur === msg ? null : cur)), 1600)
  }, [])

  const copyJson = useCallback(async () => {
    if (!logicJson) return
    try {
      await navigator.clipboard.writeText(logicJson)
      flash('Copied')
    } catch {
      flash('Copy failed')
    }
  }, [flash, logicJson])

  const downloadJson = useCallback(() => {
    if (!logicJson || !pkg) return
    const blob = new Blob([logicJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pkg.slug || pkg.name || 'logic-block'}-v${pkg.version}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [logicJson, pkg])

  const gridStyle = useMemo(
    () =>
      ({
        '--l2-props-w':
          view === 'visual' && propsOpen ? `${DEFAULT_RAIL_WIDTHS.props}px` : COLLAPSED_PROPS_W,
      }) as CSSProperties,
    [propsOpen, view],
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
          <div className="l2-logic-block-preview-view-toggle" role="tablist" aria-label="Preview view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'visual'}
              className={`l2-logic-block-preview-view-btn${view === 'visual' ? ' is-active' : ''}`}
              onClick={() => setView('visual')}
            >
              Visual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'json'}
              className={`l2-logic-block-preview-view-btn${view === 'json' ? ' is-active' : ''}`}
              onClick={() => setView('json')}
            >
              JSON
            </button>
          </div>
        </div>
        <div className="l2-visual-toolbar-actions">
          {view === 'json' && pkg ? (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void copyJson()}
              >
                {copyFlash === 'Copied' ? 'Copied' : 'Copy JSON'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={downloadJson}>
                Download
              </button>
            </>
          ) : null}
          <span className="l2-visual-hint" title="Keyboard shortcuts">
            Esc
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close preview
          </button>
        </div>
      </header>

      <p className="l2-visual-canvas-hint" aria-hidden="true">
        {view === 'visual'
          ? CANVAS_HINT
          : 'Read-only packaged logic JSON (includes package id). Copy or download as needed.'}
      </p>

      <main className={`l2-visual-main${view === 'json' ? ' l2-logic-block-preview-json-main' : ''}`}>
        {error ? (
          <p className="field-error l2-logic-block-inner-preview-status">{error}</p>
        ) : !draft || !match || !pkg ? (
          <p className="logic-block-inner-preview-loading l2-logic-block-inner-preview-status">
            Loading logic block…
          </p>
        ) : view === 'json' ? (
          <div className="l2-logic-block-preview-json">
            <div className="l2-logic-block-preview-json-toolbar">
              <span className="l2-logic-block-preview-json-meta mono">
                {pkg.id} · v{pkg.version}
              </span>
              <div className="l2-logic-block-preview-json-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void copyJson()}
                >
                  {copyFlash === 'Copied' ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadJson}>
                  Download
                </button>
              </div>
            </div>
            <pre className="l2-logic-block-preview-json-pre mono" tabIndex={0}>
              {logicJson}
            </pre>
          </div>
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

      {view === 'visual' ? (
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
      ) : null}

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
          className={view === 'visual' ? 'active' : undefined}
          onClick={() => setView('visual')}
        >
          Visual
        </button>
        <button
          type="button"
          className={view === 'json' ? 'active' : undefined}
          onClick={() => setView('json')}
        >
          JSON
        </button>
        {view === 'visual' ? (
          <button
            type="button"
            className={propsOpen ? 'active' : undefined}
            onClick={toggleProps}
          >
            Properties
          </button>
        ) : (
          <button type="button" onClick={() => void copyJson()}>
            {copyFlash === 'Copied' ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}
