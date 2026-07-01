import { useState } from 'react'
import type { CommunityFeedEntry } from '../../api/client'
import { api } from '../../api/client'
import { PublisherProfileLink } from '../marketplace/PublisherProfileLink'
import {
  MarketplaceGlobeIcon,
  MarketplaceDeploymentIcon,
} from '../marketplace/MarketplaceScopeIcons'

interface Props {
  feed: CommunityFeedEntry | null
  emptyHint?: string
}

export function CommunityFeedDetail({ feed, emptyHint = 'Select a feed to view details.' }: Props) {
  const [inputAdded, setInputAdded] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleAddInput = async () => {
    if (!feed) return
    setBusy(true)
    try {
      await api.addFeedInput(feed.feedId, feed.name, feed.ownerDid)
      setInputAdded(true)
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  const handleRemoveInput = async () => {
    if (!feed) return
    setBusy(true)
    try {
      await api.removeFeedInput(feed.feedId)
      setInputAdded(false)
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  if (!feed) {
    return (
      <div className="marketplace-sidebar-empty">
        <p>{emptyHint}</p>
      </div>
    )
  }

  return (
    <>
      <div className="sidebar-head marketplace-sidebar-toolbar">
        <div className="sidebar-head-text marketplace-sidebar-head-labels">
          <h2>Details</h2>
          <span className="sidebar-head-sub">Community feed</span>
        </div>
        <div className="marketplace-sidebar-toolbar-actions">
          {feed.allowAsInput && !inputAdded && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void handleAddInput()}
            >
              {busy ? '...' : 'Add to inputs'}
            </button>
          )}
          {feed.allowAsInput && inputAdded && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void handleRemoveInput()}
            >
              {busy ? '...' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      <div className="marketplace-sidebar-body sidebar-scroll">
        <div className="community-detail-content">
          <h3 className="community-detail-name">{feed.name}</h3>

          {feed.source && (
            <span className="community-detail-scope">
              {feed.source === 'global'
                ? <><MarketplaceGlobeIcon className="community-detail-scope-icon" /> Global</>
                : <><MarketplaceDeploymentIcon className="community-detail-scope-icon" /> This deployment</>}
            </span>
          )}

          {feed.description && (
            <p className="community-detail-desc">{feed.description}</p>
          )}

          {feed.ownerDid && (
            <div className="community-detail-owner">
              <PublisherProfileLink did={feed.ownerDid} size="md" />
            </div>
          )}

          {(feed.candidateCount != null || (feed.deploymentHost && feed.source === 'global')) && (
            <div className="community-detail-stats">
              {feed.candidateCount != null && (
                <div className="community-detail-stat">
                  <span className="community-detail-stat-value">{feed.candidateCount.toLocaleString()}</span>
                  <span className="community-detail-stat-label">posts</span>
                </div>
              )}
              {feed.deploymentHost && feed.source === 'global' && (
                <div className="community-detail-stat">
                  <span className="community-detail-stat-value">{feed.deploymentHost}</span>
                  <span className="community-detail-stat-label">origin</span>
                </div>
              )}
            </div>
          )}

          {feed.logicPublic && (
            <button type="button" className="btn btn-secondary btn-sm community-detail-view-logic">
              View logic
            </button>
          )}
        </div>
      </div>
    </>
  )
}
