/** Ref-counted `l2-editor-open` on document.body so nested editors do not strip it early. */
let editorOpenCount = 0

export function retainBodyEditorOpen(): () => void {
  editorOpenCount += 1
  if (editorOpenCount === 1) {
    document.body.classList.add('l2-editor-open')
  }
  return () => {
    editorOpenCount = Math.max(0, editorOpenCount - 1)
    if (editorOpenCount === 0) {
      document.body.classList.remove('l2-editor-open')
    }
  }
}
