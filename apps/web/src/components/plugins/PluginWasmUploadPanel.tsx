import { useState } from 'react'
import type { PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  pkg: PluginPackage
  onUploaded?: (pkg: PluginPackage) => void
  onOpenDeveloperGuide?: () => void
}

export function PluginWasmUploadPanel({ pkg, onUploaded, onOpenDeveloperGuide }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (pkg.runtime !== 'wasm' && pkg.runtime !== 'worker') return null

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
      const wasmBase64 = btoa(binary)
      const res = await api.uploadPluginWasmArtifact(pkg.id, wasmBase64)
      onUploaded?.(res.package)
      setMessage(`Uploaded ${res.package.wasmSize ?? bytes.length} bytes (v${res.package.version}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="plugin-wasm-upload">
      <p className="sidebar-block-title">WASM artifact</p>
      {pkg.wasmSha256 ? (
        <p className="card-hint">
          Uploaded · {pkg.wasmSize ?? '?'} bytes · sha256 {pkg.wasmSha256.slice(0, 12)}…
        </p>
      ) : (
        <p className="card-hint">Upload a compiled `.wasm` module before publishing.</p>
      )}
      <label className="field-label">
        .wasm file (max 2 MB)
        <input
          type="file"
          accept=".wasm,application/wasm"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
        />
      </label>
      <p className="card-hint">
        Export <code>on_sort</code> (ranker) or <code>on_inject</code> (injector) via{' '}
        <a href="https://extism.org" target="_blank" rel="noreferrer">
          Extism PDK
        </a>
        .{' '}
        {onOpenDeveloperGuide ? (
          <button type="button" className="btn-link" onClick={onOpenDeveloperGuide}>
            Plugin developer guide
          </button>
        ) : (
          <>See the in-app plugin developer guide.</>
        )}
      </p>
      {error ? <p className="field-error">{error}</p> : null}
      {message ? <p className="settings-hint">{message}</p> : null}
    </div>
  )
}
