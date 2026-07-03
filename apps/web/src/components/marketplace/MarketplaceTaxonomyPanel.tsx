import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { invalidateTaxonomyCache } from '../../lib/marketplace-taxonomy'

interface TaxonomyEntry {
  id: string
  label: string
  scope: string
}

interface Taxonomy {
  categories: TaxonomyEntry[]
  tags: TaxonomyEntry[]
}

export function MarketplaceTaxonomyPanel({ registryRole }: { registryRole?: 'registry' | 'consumer' | 'embedded' | null }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [newCatId, setNewCatId] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newTagId, setNewTagId] = useState('')
  const [newTagLabel, setNewTagLabel] = useState('')
  const [resolvedRole, setResolvedRole] = useState<string | null>(registryRole ?? null)

  const isRegistry = resolvedRole === 'registry'
  const defaultScope = isRegistry ? 'global' : 'local'

  const load = () => {
    setLoading(true)
    api.marketplaceTaxonomy()
      .then((res) => {
        setTaxonomy(res)
        if (res.registryRole) setResolvedRole(res.registryRole)
      })
      .catch(() => setTaxonomy({ categories: [], tags: [] }))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const save = async (next: Taxonomy) => {
    // Save via a PUT to the taxonomy endpoint
    await fetch('/api/marketplace/taxonomy', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    invalidateTaxonomyCache()
    setTaxonomy(next)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await api.syncMarketplaceTaxonomy()
      invalidateTaxonomyCache()
      setTaxonomy(result)
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  const addCategory = () => {
    if (!taxonomy || !newCatId.trim() || !newCatLabel.trim()) return
    const id = newCatId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (taxonomy.categories.some((c) => c.id === id)) return
    const next = { ...taxonomy, categories: [...taxonomy.categories, { id, label: newCatLabel.trim(), scope: defaultScope }] }
    void save(next)
    setNewCatId('')
    setNewCatLabel('')
  }

  const removeCategory = (id: string) => {
    if (!taxonomy) return
    void save({ ...taxonomy, categories: taxonomy.categories.filter((c) => c.id !== id) })
  }

  const addTag = () => {
    if (!taxonomy || !newTagId.trim() || !newTagLabel.trim()) return
    const id = newTagId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (taxonomy.tags.some((t) => t.id === id)) return
    const next = { ...taxonomy, tags: [...taxonomy.tags, { id, label: newTagLabel.trim(), scope: defaultScope }] }
    void save(next)
    setNewTagId('')
    setNewTagLabel('')
  }

  const removeTag = (id: string) => {
    if (!taxonomy) return
    void save({ ...taxonomy, tags: taxonomy.tags.filter((t) => t.id !== id) })
  }

  if (loading) return <p className="card-hint">Loading taxonomy...</p>
  if (!taxonomy) return <p className="card-hint">Failed to load taxonomy.</p>

  return (
    <div className="marketplace-taxonomy-panel">
      <div className="marketplace-taxonomy-actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={syncing} onClick={handleSync}>
          {syncing ? 'Syncing...' : 'Sync from global'}
        </button>
      </div>

      <section className="marketplace-taxonomy-section">
        <h3>Categories ({taxonomy.categories.length})</h3>
        <table className="marketplace-taxonomy-table">
          <thead>
            <tr><th>ID</th><th>Label</th><th>Scope</th><th></th></tr>
          </thead>
          <tbody>
            {taxonomy.categories.map((cat) => (
              <tr key={cat.id}>
                <td className="mono">{cat.id}</td>
                <td>{cat.label}</td>
                <td><span className={`marketplace-tag-badge${cat.scope === 'global' ? ' is-category' : ''}`}>{cat.scope}</span></td>
                <td>
                  {(cat.scope === 'local' || isRegistry) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeCategory(cat.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="marketplace-taxonomy-add">
          <input placeholder="id (slug)" value={newCatId} onChange={(e) => setNewCatId(e.target.value)} />
          <input placeholder="Label" value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={addCategory}>Add</button>
        </div>
      </section>

      <section className="marketplace-taxonomy-section">
        <h3>Tags ({taxonomy.tags.length})</h3>
        <table className="marketplace-taxonomy-table">
          <thead>
            <tr><th>ID</th><th>Label</th><th>Scope</th><th></th></tr>
          </thead>
          <tbody>
            {taxonomy.tags.map((tag) => (
              <tr key={tag.id}>
                <td className="mono">{tag.id}</td>
                <td>{tag.label}</td>
                <td><span className={`marketplace-tag-badge${tag.scope === 'global' ? ' is-category' : ''}`}>{tag.scope}</span></td>
                <td>
                  {(tag.scope === 'local' || isRegistry) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeTag(tag.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="marketplace-taxonomy-add">
          <input placeholder="id (slug)" value={newTagId} onChange={(e) => setNewTagId(e.target.value)} />
          <input placeholder="Label" value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={addTag}>Add</button>
        </div>
      </section>
    </div>
  )
}
