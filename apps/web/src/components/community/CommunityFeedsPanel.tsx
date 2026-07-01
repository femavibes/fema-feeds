import { useEffect, useState } from 'react'
import { api, type CommunityFeedEntry } from '../../api/client'
import { MarketplaceScopeToggle } from '../marketplace/MarketplaceScopeIcons'
import { CommunityFeedCard } from './CommunityFeedCard'

type Scope = 'all' | 'global' | 'deployment'

interface Props {
  isTemplate: boolean
  selectedFeedId?: string | null
  onSelectFeed?: (feed: CommunityFeedEntry) => void
}

export function CommunityFeedsPanel({ isTemplate, selectedFeedId, onSelectFeed }: Props) {
  const [feeds, setFeeds] = useState<CommunityFeedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<Scope>('all')

  useEffect(() => {
    setLoading(true)
    api.listCommunityFeeds(scope)
      .then((res) => {
        const filtered = res.feeds.filter((f) =>
          isTemplate ? f.isTemplate : !f.isTemplate,
        )
        setFeeds(filtered)
      })
      .catch(() => setFeeds([]))
      .finally(() => setLoading(false))
  }, [scope, isTemplate])

  return (
    <div className="community-panel">
      <div className="community-scope-row">
        <span className="community-scope-label">Scope</span>
        <MarketplaceScopeToggle
          value={scope}
          onChange={setScope}
          options={['all', 'global', 'deployment']}
        />
      </div>

      {loading ? (
        <p className="card-hint">Loading...</p>
      ) : feeds.length === 0 ? (
        <p className="community-empty">
          {isTemplate
            ? 'No templates shared yet. Flag a feed as "Template" in feed settings to share it here.'
            : 'No public feeds yet. Enable "Public on Community" in feed settings to list your feed here.'}
        </p>
      ) : (
        <div className="community-feed-list">
          {feeds.map((feed) => (
            <CommunityFeedCard
              key={feed.feedId}
              feed={feed}
              selected={feed.feedId === selectedFeedId}
              onClick={() => onSelectFeed?.(feed)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
