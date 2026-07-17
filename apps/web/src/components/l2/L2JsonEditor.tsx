import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { forEachDiagnostic, linter } from '@codemirror/lint'
import { syntaxTree } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

import type { FeedConfig } from '@cfb/core-types'
import { retainBodyEditorOpen } from '../../lib/body-editor-open'
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
const WRAP_STORAGE_KEY = 'cfb.l2.json.wrap'

function readWrapPref(): boolean {
  try {
    return sessionStorage.getItem(WRAP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeWrapPref(on: boolean): void {
  try {
    sessionStorage.setItem(WRAP_STORAGE_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
}

function parseJsonErrorPos(text: string): number | null {
  try {
    JSON.parse(text)
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const atPos = msg.match(/position\s+(\d+)/i)
    if (atPos) return Number(atPos[1])
    const atLine = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
    if (atLine) {
      const line = Number(atLine[1])
      const col = Number(atLine[2])
      const lines = text.split('\n')
      let offset = 0
      for (let i = 0; i < line - 1 && i < lines.length; i++) offset += (lines[i]?.length ?? 0) + 1
      return offset + Math.max(0, col - 1)
    }
    return null
  }
}

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

const setPastePreview = StateEffect.define<{ from: number; to: number } | null>()

const pastePreviewField = StateField.define({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPastePreview)) {
        if (!effect.value || effect.value.from >= effect.value.to) return Decoration.none
        return Decoration.set([
          Decoration.mark({ class: 'cm-paste-preview' }).range(effect.value.from, effect.value.to),
        ])
      }
    }
    return deco.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

function clearPastePreview(view: EditorView) {
  view.dispatch({ effects: setPastePreview.of(null) })
}

function showPastePreview(view: EditorView, from: number, to: number) {
  view.dispatch({
    effects: [
      setPastePreview.of({ from, to }),
      EditorView.scrollIntoView(from, { y: 'nearest' }),
    ],
  })
}

/** Innermost Object/Array (or Property value) containing `pos` — replace target. */
function findEnclosingJsonBlock(
  view: EditorView,
  pos: number,
): { from: number; to: number; label: string } | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1)
  while (node) {
    if (node.name === 'Object' || node.name === 'Array') {
      return { from: node.from, to: node.to, label: node.name === 'Object' ? 'object' : 'array' }
    }
    if (node.name === 'Property') {
      const value = node.lastChild
      if (
        value &&
        (value.name === 'Object' ||
          value.name === 'Array' ||
          value.name === 'String' ||
          value.name === 'Number' ||
          value.name === 'True' ||
          value.name === 'False' ||
          value.name === 'Null')
      ) {
        return { from: value.from, to: value.to, label: 'value' }
      }
    }
    node = node.parent
  }
  return null
}

/** Nearest Array containing `pos` — append target. */
function findEnclosingArray(
  view: EditorView,
  pos: number,
): { from: number; to: number; node: SyntaxNode } | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1)
  while (node) {
    if (node.name === 'Array') return { from: node.from, to: node.to, node }
    node = node.parent
  }
  return null
}

function indentBlock(pretty: string, indent: string): string {
  if (!pretty.includes('\n')) return pretty
  return pretty
    .split('\n')
    .map((row, i) => (i === 0 ? row : indent + row))
    .join('\n')
}

async function readClipboardJson(): Promise<{ ok: true; value: unknown; raw: string } | { ok: false; error: string }> {
  let clip = ''
  try {
    clip = await navigator.clipboard.readText()
  } catch {
    return { ok: false, error: 'Could not read clipboard — paste permission denied' }
  }
  const trimmed = clip.trim()
  if (!trimmed) return { ok: false, error: 'Clipboard is empty' }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown, raw: trimmed }
  } catch {
    return { ok: false, error: 'Clipboard is not valid JSON' }
  }
}

function resolveReplaceTarget(
  view: EditorView,
): { from: number; to: number; label: string } | null {
  const sel = view.state.selection.main
  if (!sel.empty) return { from: sel.from, to: sel.to, label: 'selection' }
  return findEnclosingJsonBlock(view, sel.head)
}

function resolveAppendTarget(
  view: EditorView,
): { from: number; to: number; node: SyntaxNode } | null {
  return findEnclosingArray(view, view.state.selection.main.head)
}

/** Tap a line number to select the JSON array/object on that line (mobile-friendly target pick). */
const gutterBlockSelect = EditorView.domEventHandlers({
  click(event, view) {
    const el = event.target as HTMLElement | null
    if (!el?.closest('.cm-lineNumbers')) return false

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return false

    // Prefer the array when one encloses this line — that's what Append needs.
    const target = findEnclosingArray(view, pos) ?? findEnclosingJsonBlock(view, pos)
    if (!target) return false

    event.preventDefault()
    view.dispatch({
      selection: { anchor: target.from, head: target.to },
      effects: [
        setPastePreview.of({ from: target.from, to: target.to }),
        EditorView.scrollIntoView(target.from, { y: 'nearest' }),
      ],
    })
    return true
  },
})

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
  const [graphModalOpen, setGraphModalOpen] = useState(false)
  const [wrapLines, setWrapLines] = useState(readWrapPref)
  /** First tap previews; second tap confirms (needed on touch where hover doesn't exist). */
  const [armedPaste, setArmedPaste] = useState<'replace' | 'append' | null>(null)

  const cmRef = useRef<ReactCodeMirrorRef>(null)

  const { bindText, recordBeforeChange, undo, redo, canUndo, canRedo, resetHistory } =
    useTextEditorHistory(draft.feedId)

  const flash = useCallback((msg: string | null) => {
    setStatusMessage(msg)
    window.setTimeout(() => setStatusMessage(null), 2400)
  }, [])

  const getView = useCallback(() => cmRef.current?.view ?? null, [])

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
      if (e.key === 'Escape') {
        if (graphModalOpen) {
          setGraphModalOpen(false)
          return
        }
        if (armedPaste) {
          setArmedPaste(null)
          const view = getView()
          if (view) clearPastePreview(view)
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const releaseBodyEditorOpen = retainBodyEditorOpen()
    return () => {
      window.removeEventListener('keydown', onKey)
      releaseBodyEditorOpen()
    }
  }, [onClose, onAutosaveDraft, undo, redo, canonical, dirty, draft, saving, text, flash, graphModalOpen, armedPaste, getView])

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

  const toggleWrap = () => {
    setWrapLines((on) => {
      const next = !on
      writeWrapPref(next)
      flash(next ? 'Line wrap on' : 'Line wrap off')
      return next
    })
  }

  const handleFind = () => {
    const view = getView()
    if (!view) return
    openSearchPanel(view)
    view.focus()
  }

  const previewReplaceTarget = () => {
    const view = getView()
    if (!view) return
    const target = resolveReplaceTarget(view)
    if (!target) {
      clearPastePreview(view)
      return
    }
    showPastePreview(view, target.from, target.to)
  }

  const previewAppendTarget = () => {
    const view = getView()
    if (!view) return
    const target = resolveAppendTarget(view)
    if (!target) {
      clearPastePreview(view)
      return
    }
    showPastePreview(view, target.from, target.to)
  }

  const endPastePreview = () => {
    // Don't clear while a confirm-tap is armed — mobile needs the highlight to stick.
    if (armedPaste) return
    const view = getView()
    if (view) clearPastePreview(view)
  }

  const runReplaceBlock = async () => {
    const view = getView()
    if (!view) return
    setError(null)

    const target = resolveReplaceTarget(view)
    if (!target) {
      setError('Put the cursor inside an object, array, or value — or tap a line number to select one')
      setArmedPaste(null)
      return
    }

    showPastePreview(view, target.from, target.to)

    const clip = await readClipboardJson()
    if (!clip.ok) {
      setError(clip.error)
      return
    }

    const pretty = JSON.stringify(clip.value, null, 2)
    const line = view.state.doc.lineAt(target.from)
    const indent = line.text.match(/^\s*/)?.[0] ?? ''
    const indented = indentBlock(pretty, indent)

    recordBeforeChange()
    view.dispatch({
      changes: { from: target.from, to: target.to, insert: indented },
      selection: { anchor: target.from, head: target.from + indented.length },
      effects: [setPastePreview.of(null), EditorView.scrollIntoView(target.from, { y: 'center' })],
    })
    const next = view.state.doc.toString()
    setText(next)
    setDirty(next !== canonical)
    setArmedPaste(null)
    flash(`Replaced ${target.label} from clipboard`)
    view.focus()
  }

  const runAppendToArray = async () => {
    const view = getView()
    if (!view) return
    setError(null)

    const target = resolveAppendTarget(view)
    if (!target) {
      setError('Put the cursor inside an array — or tap a line number inside one to select it')
      setArmedPaste(null)
      return
    }

    showPastePreview(view, target.from, target.to)

    const clip = await readClipboardJson()
    if (!clip.ok) {
      setError(clip.error)
      return
    }

    const arrayNode = target.node
    const items: SyntaxNode[] = []
    for (let child = arrayNode.firstChild; child; child = child.nextSibling) {
      if (child.name !== '[' && child.name !== ']') items.push(child)
    }

    const closeBracket = arrayNode.lastChild
    if (!closeBracket || closeBracket.name !== ']') {
      setError('Could not find the end of that array')
      return
    }

    const line = view.state.doc.lineAt(arrayNode.from)
    const baseIndent = line.text.match(/^\s*/)?.[0] ?? ''
    const itemIndent = `${baseIndent}  `
    const pretty = indentBlock(JSON.stringify(clip.value, null, 2), itemIndent)

    let insertFrom: number
    let insertText: string
    if (items.length === 0) {
      insertFrom = closeBracket.from
      insertText = `\n${itemIndent}${pretty}\n${baseIndent}`
    } else {
      const last = items[items.length - 1]!
      insertFrom = last.to
      insertText = `,\n${itemIndent}${pretty}`
    }

    const newFrom = insertFrom + (items.length === 0 ? `\n${itemIndent}`.length : `,\n${itemIndent}`.length)
    const newTo = newFrom + pretty.length

    recordBeforeChange()
    view.dispatch({
      changes: { from: insertFrom, to: insertFrom, insert: insertText },
      selection: { anchor: newFrom, head: newTo },
      effects: [setPastePreview.of(null), EditorView.scrollIntoView(newFrom, { y: 'center' })],
    })
    const next = view.state.doc.toString()
    setText(next)
    setDirty(next !== canonical)
    setArmedPaste(null)
    flash('Appended item to array')
    view.focus()
  }

  /** First tap highlights the target; second tap pastes. Hover still previews on desktop. */
  const handleReplaceClick = () => {
    const view = getView()
    if (!view) return
    const target = resolveReplaceTarget(view)
    if (!target) {
      setError('Put the cursor inside an object, array, or value — or tap a line number to select one')
      setArmedPaste(null)
      return
    }
    if (armedPaste !== 'replace') {
      setError(null)
      view.dispatch({
        selection: { anchor: target.from, head: target.to },
        effects: [
          setPastePreview.of({ from: target.from, to: target.to }),
          EditorView.scrollIntoView(target.from, { y: 'nearest' }),
        ],
      })
      setArmedPaste('replace')
      flash('Highlighted — tap Replace again to paste')
      return
    }
    void runReplaceBlock()
  }

  const handleAppendClick = () => {
    const view = getView()
    if (!view) return
    const target = resolveAppendTarget(view)
    if (!target) {
      setError('Put the cursor inside an array — or tap a line number inside one to select it')
      setArmedPaste(null)
      return
    }
    if (armedPaste !== 'append') {
      setError(null)
      view.dispatch({
        selection: { anchor: target.from, head: target.to },
        effects: [
          setPastePreview.of({ from: target.from, to: target.to }),
          EditorView.scrollIntoView(target.from, { y: 'nearest' }),
        ],
      })
      setArmedPaste('append')
      flash('Highlighted — tap Append again to paste')
      return
    }
    void runAppendToArray()
  }

  const jumpToError = useCallback(() => {
    const view = getView()
    if (!view) return

    let from: number | null = null
    let to: number | null = null
    forEachDiagnostic(view.state, (d) => {
      if (from != null) return
      if (d.severity === 'error') {
        from = d.from
        to = d.to
      }
    })

    if (from == null) {
      const pos = parseJsonErrorPos(text)
      if (pos != null) {
        from = pos
        to = Math.min(text.length, pos + 1)
      }
    }

    if (from == null) return
    const head = to ?? from
    view.dispatch({
      selection: { anchor: from, head },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
    view.focus()
  }, [getView, text])

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

  const extensions = useMemo(() => {
    const exts = [json(), linter(jsonParseLinter()), pastePreviewField, gutterBlockSelect]
    if (wrapLines) exts.push(EditorView.lineWrapping)
    return exts
  }, [wrapLines])

  const errorBanner = error ? (
    <button
      type="button"
      className="field-error l2-json-error-jump"
      onClick={jumpToError}
      title="Jump to the error in the editor"
    >
      {error}
      <span className="l2-json-error-jump-hint">Tap to jump</span>
    </button>
  ) : null

  const overlay = (
    <div className="l2-json-fullscreen" role="dialog" aria-modal="true" aria-label="JSON feed logic editor">
      <header className="l2-visual-toolbar l2-json-toolbar">
        <div className="l2-visual-toolbar-left">
          <h2>{draft.name}</h2>
          <span className="l2-visual-toolbar-sub">JSON editor</span>
          {autosaveBadge(autosaveState, dirty)}
          {statusMessage ? <span className="l2-json-status">{statusMessage}</span> : null}
        </div>
        <div className="l2-visual-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setGraphModalOpen(true)}
          >
            Import / Export
          </button>
          {revertToLive ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenVisual}>
            Visual Editor
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm l2-editor-close"
            onClick={onClose}
            aria-label="Close editor"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="l2-json-toolbar-editor-tools">
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
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleFormat}>
            Format
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm${wrapLines ? ' is-active' : ''}`}
            onClick={toggleWrap}
            aria-pressed={wrapLines}
            title="Toggle soft wrap for long lines"
          >
            Wrap
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleFind} title="Find (Ctrl+F)">
            Find
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm${armedPaste === 'replace' ? ' is-active' : ''}`}
            onPointerEnter={previewReplaceTarget}
            onPointerLeave={endPastePreview}
            onClick={handleReplaceClick}
            title="Replace the highlighted block with clipboard JSON (tap twice to confirm)"
          >
            Replace
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm${armedPaste === 'append' ? ' is-active' : ''}`}
            onPointerEnter={previewAppendTarget}
            onPointerLeave={endPastePreview}
            onClick={handleAppendClick}
            title="Append clipboard JSON into the highlighted array (tap twice to confirm)"
          >
            Append
          </button>
        </div>
      </header>

      {error ? (
        <div className="l2-json-mobile-error-host">{errorBanner}</div>
      ) : null}

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
        {error ? <div className="l2-json-guide-error">{errorBanner}</div> : null}
      </aside>

      <main className="l2-json-main">
        <CodeMirror
          ref={cmRef}
          className="l2-json-codemirror scrollbar-modern"
          value={text}
          height="100%"
          extensions={extensions}
          onChange={(value) => {
            recordBeforeChange()
            setText(value)
            setDirty(value !== canonical)
            setError(null)
          }}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: false,
            searchKeymap: true,
          }}
        />
      </main>

      {graphModalOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => setGraphModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal-dialog l2-json-graph-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Import or export graph"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Import / Export</h2>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setGraphModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p className="card-hint">
                Copy to clipboard, download a file, or load a graph JSON into the editor.
              </p>
              <button
                type="button"
                className="btn btn-secondary l2-json-graph-option"
                onClick={() => {
                  void handleExport().then(() => setGraphModalOpen(false))
                }}
              >
                <span className="l2-json-graph-option-title">Export graph</span>
                <span className="l2-json-graph-option-desc">Copy JSON to the clipboard</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary l2-json-graph-option"
                onClick={() => {
                  handleDownload()
                  setGraphModalOpen(false)
                }}
              >
                <span className="l2-json-graph-option-title">Download graph</span>
                <span className="l2-json-graph-option-desc">Save as a .json file</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary l2-json-graph-option"
                onClick={() => {
                  setGraphModalOpen(false)
                  handleImportFile()
                }}
              >
                <span className="l2-json-graph-option-title">Import graph</span>
                <span className="l2-json-graph-option-desc">Load a .json file into the editor</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return createPortal(overlay, document.body)
}
