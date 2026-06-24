import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import CodeMirror from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'

import type { FeedConfig } from '@cfb/core-types'
import { useTextEditorHistory } from '../../hooks/useTextEditorHistory'
import {
  applyFeedLogicJson,
  copyFeedLogicJson,
  downloadFeedLogicJson,
  feedLogicJson,
  type FeedLogicPatch,
} from '../../lib/feed-graph-exchange'

type AutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 2000

function autosaveBadge(state: AutosaveState, dirty: boolean) {
  if (state === 'saving' || state === 'pending') {
    return <span className="badge badge-muted">Autosaving…</span>
  }
  if (state === 'saved') return <span className="badge badge-on">Draft autosaved</span>
  if (state === 'error') return <span className="badge badge-warn">Autosave failed</span>
  if (dirty) return <span className="badge badge-warn">Unsaved changes</span>
  return null
}

interface Props {
  draft: FeedConfig
  saving?: boolean
  autosaveState?: AutosaveState
  onAutosaveDraft?: (patch: FeedLogicPatch) => Promise<void>
  revertToLive?: { enabled: boolean; onRevert: () => void }
  onRegisterFlush?: (flush: () => Promise<boolean>) => void
  onUnsavedChange?: (unsaved: boolean) => void
  onClose: () => void
  onOpenVisual: () => void
}

export function L2JsonEditor({
  draft,
  saving = false,
  autosaveState = 'idle',
  onAutosaveDraft,
  revertToLive,
  onRegisterFlush,
  onUnsavedChange,
  onClose,
  onOpenVisual,
}: Props) {
  const canonical = useMemo(() => feedLogicJson(draft), [draft])
  const [text, setText] = useState(canonical)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const { bindText, recordBeforeChange, undo, redo, canUndo, canRedo, resetHistory } =
    useTextEditorHistory(draft.feedId)

  const flash = useCallback((msg: string | null) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2400)
  }, [])

  useEffect(() => {
    bindText(text)
  }, [text, bindText])
  useEffect(() => {
    if (!dirty) setText(canonical)
  }, [canonical, dirty])

  useEffect(() => {
    onUnsavedChange?.(dirty)
  }, [dirty, onUnsavedChange])

  useEffect(() => {
    if (!dirty || saving || !onAutosaveDraft) return
    const timer = window.setTimeout(() => {
      const result = applyFeedLogicJson(text, draft, { confirmReplace: false })
      if (!result.ok) return
      void onAutosaveDraft(result.patch)
        .then(() => {
          setDirty(false)
          setError(null)
        })
        .catch(() => undefined)
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [text, dirty, draft, saving, onAutosaveDraft])

  useEffect(() => {
    onRegisterFlush?.(async () => {
      if (!dirty) return true
      const result = applyFeedLogicJson(text, draft, { confirmReplace: false })
      if (!result.ok) return false
      try {
        await onAutosaveDraft?.(result.patch)
        setDirty(false)
        setError(null)
        return true
      } catch {
        return false
      }
    })
  }, [dirty, text, draft, onAutosaveDraft, onRegisterFlush])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) =>
      Boolean(
        target &&
          (target as HTMLElement).closest('.cm-editor, input, textarea, select, [contenteditable="true"]'),
      )

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        const next = e.shiftKey ? redo() : undo()
        if (next != null) {
          setText(next)
          setDirty(next !== canonical)
          setError(null)
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'y' && isEditableTarget(e.target)) {
        e.preventDefault()
        const next = redo()
        if (next != null) {
          setText(next)
          setDirty(next !== canonical)
          setError(null)
        }
        return
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!dirty || saving || !onAutosaveDraft) return
        const result = applyFeedLogicJson(text, draft, { confirmReplace: false })
        if (!result.ok) {
          if (result.error !== 'Cancelled') setError(result.error)
          return
        }
        void onAutosaveDraft(result.patch)
          .then(() => {
            setDirty(false)
            setError(null)
            flash('Draft saved')
          })
          .catch(() => undefined)
        return
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('l2-editor-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('l2-editor-open')
    }
  }, [onClose, onAutosaveDraft, undo, redo, canonical, dirty, draft, saving, text, flash])

  const handleFormat = () => {
    setError(null)
    try {
      const formatted = JSON.stringify(JSON.parse(text) as unknown, null, 2)
      setText(formatted)
      setDirty(formatted !== canonical)
      flash('Formatted JSON')
    } catch {
      setError('Fix JSON syntax before formatting')
    }
  }

  const handleExport = async () => {
    setError(null)
    if (dirty) {
      try {
        await navigator.clipboard.writeText(text)
        flash('Editor JSON copied to clipboard')
      } catch {
        setError('Could not copy — use Download instead')
      }
      return
    }
    const result = await copyFeedLogicJson(draft)
    if (result === 'ok') flash('Graph JSON copied to clipboard')
    else setError('Could not copy — use Download instead')
  }

  const handleDownload = () => {
    setError(null)
    if (dirty) {
      try {
        JSON.parse(text)
      } catch {
        setError('Fix JSON syntax before downloading')
        return
      }
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${draft.feedId}-graph.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      downloadFeedLogicJson(draft, draft.feedId)
    }
    flash('Graph downloaded')
  }

  const handleImportFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((contents) => {
        setText(contents)
        setDirty(true)
        setError(null)
        flash(`Loaded ${file.name} — valid JSON will autosave as draft`)
      })
    }
    input.click()
  }

  const handleReset = () => {
    resetHistory()
    setText(canonical)
    setDirty(false)
    setError(null)
    flash('Reverted to saved feed logic')
  }

  const extensions = useMemo(() => [json(), linter(jsonParseLinter())], [])

  const overlay = (
    <div className="l2-json-fullscreen" role="dialog" aria-modal="true" aria-label="JSON feed logic editor">
      <header className="l2-visual-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{draft.name}</h2>
          <span className="l2-visual-toolbar-sub">JSON editor</span>
          {autosaveBadge(autosaveState, dirty)}
          {statusMessage ? <span className="l2-json-status">{statusMessage}</span> : null}
        </div>
        <div className="l2-visual-toolbar-actions">
          <div className="l2-visual-history-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canUndo}
              onClick={() => {
                const next = undo()
                if (next != null) {
                  setText(next)
                  setDirty(next !== canonical)
                  setError(null)
                }
              }}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!canRedo}
              onClick={() => {
                const next = redo()
                if (next != null) {
                  setText(next)
                  setDirty(next !== canonical)
                  setError(null)
                }
              }}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo
            </button>
          </div>
          <span className="l2-editor-switch" aria-hidden="true" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleExport()}>
            Export graph
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownload}>
            Download graph
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleImportFile}>
            Import graph
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleFormat}>
            Format
          </button>
          {revertToLive ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!revertToLive.enabled || saving}
              title={
                revertToLive.enabled
                  ? 'Discard autosaved draft changes and restore the live rule graph'
                  : 'Draft already matches live rules'
              }
              onClick={() => {
                resetHistory()
                revertToLive.onRevert()
              }}
            >
              Revert to live
            </button>
          ) : dirty ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>
              Reset
            </button>
          ) : null}
          <span className="l2-editor-switch" aria-hidden="true" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenVisual}>
            Open visual editor
          </button>
          <span className="l2-visual-hint" title="Keyboard shortcuts">
            Ctrl+Z · Ctrl+S · Esc
          </span>          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Back to rules
          </button>
        </div>
      </header>

      <aside className="l2-json-guide" aria-label="JSON format help">
        <h3>Feed logic JSON</h3>
        <p>
          Native exports use <code>format: cfb-feed-graph</code> with <code>match</code> (rule tree), optional{' '}
          <code>visualLayout</code> (canvas routes), and <code>rank</code>.
        </p>
        <p>
          Edits <strong>autosave as draft</strong> when JSON is valid (about 2 seconds after you stop
          typing). Use <strong>Deploy</strong> in the sidebar to update live or publish on Bluesky.
        </p>
        <p>
          You can paste feed-gen / Graze JSON — it converts on autosave when syntax is valid. Errors are
          underlined in the editor.
        </p>
        <p className="l2-json-guide-note">
          After importing, open the visual editor to verify routes from START to FEED.
        </p>
        {error ? <p className="field-error l2-json-guide-error">{error}</p> : null}
      </aside>

      <main className="l2-json-main">
        <CodeMirror
          className="l2-json-codemirror scrollbar-modern"
          value={text}
          height="100%"
          extensions={extensions}
          onChange={(value) => {
            recordBeforeChange()
            setText(value)
            setDirty(value !== canonical)
            setError(null)
          }}          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: false,
          }}
        />
      </main>
    </div>
  )

  return createPortal(overlay, document.body)
}
