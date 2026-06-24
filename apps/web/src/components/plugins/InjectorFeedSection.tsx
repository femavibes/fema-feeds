import { useEffect, useState } from 'react'
import type { FeedConfig, FeedInjectorConfig, PluginPackage } from '@cfb/core-types'

import { api } from '../../api/client'

interface Props {
  draft: FeedConfig
  onChange: (next: FeedConfig) => void
}

function defaultInjector(pkg: PluginPackage, versionPin: string): FeedInjectorConfig {
  return {
    packageId: pkg.id,
    versionPin,
    label: pkg.name,
    slots: { every: 8, maxPerPage: 2 },
    disclosure: pkg.manifest.disclosure,
    config: pkg.runtime === 'native' ? { uris: [] } : {},
  }
}

export function InjectorFeedSection({ draft, onChange }: Props) {
  const [subscriptions, setSubscriptions] = useState<
    Awaited<ReturnType<typeof api.listPluginSubscriptions>>['subscriptions']
  >([])

  const injector = draft.injector

  useEffect(() => {
    void api
      .listPluginSubscriptions('injector')
      .then((res) => setSubscriptions(res.subscriptions))
      .catch(() => setSubscriptions([]))
  }, [])

  const applyInjector = (pkg: PluginPackage, versionPin: string) => {
    onChange({ ...draft, injector: defaultInjector(pkg, versionPin) })
  }

  const patchInjector = (patch: Partial<FeedInjectorConfig>) => {
    if (!injector) return
    onChange({ ...draft, injector: { ...injector, ...patch } })
  }

  const patchSlots = (field: 'every' | 'maxPerPage', raw: string) => {
    if (!injector) return
    const n = Math.max(1, Number.parseInt(raw, 10) || 1)
    onChange({
      ...draft,
      injector: { ...injector, slots: { ...injector.slots, [field]: n } },
    })
  }

  const patchUris = (text: string) => {
    if (!injector) return
    const uris = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    onChange({
      ...draft,
      injector: { ...injector, config: { ...injector.config, uris } },
    })
  }

  const clearInjector = () => {
    const { injector: _removed, ...rest } = draft
    onChange(rest as FeedConfig)
  }

  const uriText = Array.isArray(injector?.config?.uris)
    ? (injector.config.uris as string[]).join('\n')
    : ''

  return (
    <div className="feed-sorting-packs feed-injector-section">
      <p className="sidebar-block-title">Serve-time injector (custom code)</p>
      {injector ? (
        <>
          <p className="card-hint">
            Using <strong>{injector.label ?? 'injector'}</strong> v{injector.versionPin}. Runs after sort,
            before skeleton response.
          </p>
          <div className="feed-injector-slots">
            <label className="field-label">
              Insert every N posts
              <input
                type="number"
                min={1}
                value={injector.slots.every}
                onChange={(e) => patchSlots('every', e.target.value)}
              />
            </label>
            <label className="field-label">
              Max per page
              <input
                type="number"
                min={1}
                value={injector.slots.maxPerPage}
                onChange={(e) => patchSlots('maxPerPage', e.target.value)}
              />
            </label>
          </div>
          <label className="field-label">
            Disclosure (describeFeedGenerator)
            <textarea
              rows={2}
              value={injector.disclosure ?? ''}
              onChange={(e) => patchInjector({ disclosure: e.target.value || undefined })}
              placeholder="This feed may include promoted posts…"
            />
          </label>
          <label className="field-label">
            Native URIs (one at:// URI per line)
            <textarea
              rows={4}
              value={uriText}
              onChange={(e) => patchUris(e.target.value)}
              placeholder="at://did:plc:…/app.bsky.feed.post/…"
            />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearInjector}>
            Remove injector
          </button>
        </>
      ) : (
        <p className="card-hint">
          Subscribe to an injector in Marketplace, then apply it here. Slot caps are enforced by CFB.
        </p>
      )}

      {subscriptions.length > 0 ? (
        <ul className="logic-blocks-catalog-list feed-sorting-pack-list">
          {subscriptions.map((sub) => (
            <li key={sub.packageId}>
              <button
                type="button"
                className="logic-blocks-catalog-item"
                onClick={() => applyInjector(sub.package, sub.versionPin)}
              >
                <span className="logic-blocks-catalog-name">{sub.package.name}</span>
                <span className="logic-blocks-catalog-sub">
                  v{sub.versionPin} · {sub.package.runtime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-hint">Subscribe to injectors in Marketplace → Browse → Injectors.</p>
      )}
    </div>
  )
}
