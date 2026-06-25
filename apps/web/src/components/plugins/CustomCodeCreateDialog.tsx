import { useState } from 'react'
import type { PluginKind, PluginRuntime, PublisherVerificationStatus } from '@cfb/core-types'

import { LogicBlockMetadataFields } from '../logic-blocks/LogicBlockMetadataFields'

interface Props {
  publisherVerification: PublisherVerificationStatus | null
  defaultKind?: PluginKind
  onCancel: () => void
  onOpenDeveloperGuide?: () => void
  onCreate: (input: {
    kind: PluginKind
    runtime: 'native' | 'remote' | 'wasm' | 'worker'
    name: string
    slug: string
    description: string
    remoteEndpoint?: string
  }) => void
  busy?: boolean
  error?: string | null
}

const KIND_OPTIONS: { id: PluginKind; label: string; hint: string }[] = [
  {
    id: 'ranker',
    label: 'Ranker',
    hint: 'Reorders feed pages at serve time (`onSort`). Use for custom sorting beyond native formulas.',
  },
  {
    id: 'injector',
    label: 'Injector',
    hint: 'Inserts posts after sort (`onInject`). Use for ads, promos, and sponsored slots.',
  },
]

export function CustomCodeCreateDialog({
  publisherVerification,
  defaultKind = 'ranker',
  onCancel,
  onOpenDeveloperGuide,
  onCreate,
  busy = false,
  error,
}: Props) {
  const [kind, setKind] = useState<PluginKind>(defaultKind)
  const [runtime, setRuntime] = useState<'native' | 'remote' | 'wasm' | 'worker'>('wasm')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [remoteEndpoint, setRemoteEndpoint] = useState('')

  const canCreate = Boolean(
    publisherVerification?.deploymentVerified || publisherVerification?.globalVerified,
  )

  return (
    <div className="logic-block-create-overlay" role="dialog" aria-modal="true" aria-label="New custom code">
      <div className="logic-block-create-dialog custom-code-create-dialog">
        <h2>New custom code</h2>

        {!canCreate ? (
          <div className="custom-code-verify-gate">
            <p className="field-error">Publisher verification required</p>
            <p className="card-hint">
              Custom code (rankers and injectors) can only be created by verified publishers. Ask your
              deployment master to verify you for this VPS, or the global marketplace operator
              (fema.monster) for cross-deployment listings.
            </p>
          </div>
        ) : (
          <>
            <p className="card-hint">
              {publisherVerification?.globalVerified
                ? 'You are globally verified — you can publish to this deployment or the global marketplace.'
                : 'You are verified on this deployment — you can publish here after testing in your collection.'}
            </p>

            <fieldset className="custom-code-kind-picker">
              <legend className="field-label">Extension type</legend>
              {KIND_OPTIONS.map((opt) => (
                <label key={opt.id} className="custom-code-kind-option">
                  <input
                    type="radio"
                    name="custom-code-kind"
                    value={opt.id}
                    checked={kind === opt.id}
                    disabled={busy}
                    onChange={() => setKind(opt.id)}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    <span className="card-hint">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="field-label">
              Runtime
              <select
                value={runtime}
                disabled={busy}
                onChange={(e) =>
                  setRuntime(e.target.value as 'native' | 'remote' | 'wasm' | 'worker')
                }
              >
                <option value="wasm">WASM — upload compiled module (sandboxed, cached)</option>
                <option value="worker">Worker — WASM in background thread (extra isolation)</option>
                <option value="native">Native — built-in adapter + feed config</option>
                <option value="remote">Remote — HTTPS endpoint you host</option>
              </select>
            </label>
            <p className="card-hint">
              WASM is fast for skeleton hooks (~1–2 ms per page once cached). Worker adds a thread
              boundary for isolation. Upload the <code>.wasm</code> file after creating the package.{' '}
              {onOpenDeveloperGuide ? (
                <button type="button" className="btn-link" onClick={onOpenDeveloperGuide}>
                  Open plugin developer guide
                </button>
              ) : null}
            </p>

            {runtime === 'remote' ? (
              <label className="field-label">
                Remote endpoint (HTTPS POST)
                <input
                  type="url"
                  value={remoteEndpoint}
                  disabled={busy}
                  placeholder="https://your-service.example/rank"
                  onChange={(e) => setRemoteEndpoint(e.target.value)}
                />
              </label>
            ) : null}

            <LogicBlockMetadataFields
              name={name}
              slug={slug}
              description={description}
              disabled={busy}
              onNameChange={setName}
              onSlugChange={setSlug}
              onDescriptionChange={setDescription}
            />
          </>
        )}

        {error ? <p className="field-error">{error}</p> : null}

        <div className="logic-block-create-actions">
          {canCreate ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                busy ||
                !name.trim() ||
                (runtime === 'remote' && !remoteEndpoint.trim())
              }
              onClick={() =>
                onCreate({
                  kind,
                  runtime,
                  name: name.trim(),
                  slug: slug.trim() || name.trim(),
                  description: description.trim(),
                  remoteEndpoint: runtime === 'remote' ? remoteEndpoint.trim() : undefined,
                })
              }
            >
              {busy ? 'Creating…' : 'Create package'}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
            {canCreate ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
