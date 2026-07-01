import type { CommunityFeedEntry } from '../../api/client'
import {
  MarketplaceGlobeIcon,
  MarketplaceDeploymentIcon,
} from '../marketplace/MarketplaceScopeIcons'
import { PublisherProfileLink } from '../marketplace/PublisherProfileLink'

/** Deterministic accent color from feed ID */
function feedAccentColor(feedId: string): string {
  let hash = 0
  for (let i = 0; i < feedId.length; i++) hash = ((hash << 5) - hash + feedId.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 45%)`
}

function feedInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function CommunityFeedCard({ feed, selected, onClick }: { feed: CommunityFeedEntry; selected?: boolean; onClick?: () => void }) {
  const accent = feedAccentColor(feed.feedId)

  return (
    <button
      type="button"
      className={`community-feed-card${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <div className="community-feed-card-accent" style={{ background: accent }}>
        <span className="community-feed-card-initials">{feedInitials(feed.name)}</span>
      </div>
      <div className="community-feed-card-body">
        <div className="community-feed-card-head">
          <span className="community-feed-card-name">{feed.name}</span>
          <div className="community-feed-card-meta">
            {feed.source && (
              <span
                className="community-feed-card-scope"
                title={feed.source === 'global' ? 'Global' : 'This deployment'}
              >
                {feed.source === 'global'
                  ? <MarketplaceGlobeIcon className="community-feed-card-scope-icon" />
                  : <MarketplaceDeploymentIcon className="community-feed-card-scope-icon" />}
              </span>
            )}
          </div>
        </div>
        {feed.description && (
          <p className="community-feed-card-desc">{feed.description}</p>
        )}
        <div className="community-feed-card-footer">
          {feed.ownerDid && (
            <PublisherProfileLink did={feed.ownerDid} size="sm" stopPropagation />
          )}
          {feed.candidateCount != null && (
            <span className="community-feed-card-stat">{feed.candidateCount.toLocaleString()} posts</span>
          )}
        </div>
      </div>
    </button>
  )
}
