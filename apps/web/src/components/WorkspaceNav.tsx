import type {
  CollectionWorkspaceView,
  FeedWorkspaceView,
  IngestionWorkspaceView,
  MarketplaceWorkspaceView,
  SettingsWorkspaceView,
} from '../lib/workspace-views'

type WorkspaceMode = 'ingestion' | 'feed' | 'marketplace' | 'collection' | 'settings'

interface Props {
  mode: WorkspaceMode
  contextLabel: string
  feedView?: FeedWorkspaceView
  ingestionView?: IngestionWorkspaceView
  marketplaceView?: MarketplaceWorkspaceView
  settingsView?: SettingsWorkspaceView
  onFeedViewChange?: (view: FeedWorkspaceView) => void
  onIngestionViewChange?: (view: IngestionWorkspaceView) => void
  onMarketplaceViewChange?: (view: MarketplaceWorkspaceView) => void
  onVerifyPublisherClick?: () => void
  showVerifyPublisher?: boolean
  onNewLogicBlockClick?: () => void
  onNewCustomCodeClick?: () => void
  collectionView?: CollectionWorkspaceView
  onCollectionViewChange?: (view: CollectionWorkspaceView) => void
  onOpenDeveloperGuide?: () => void
  onSettingsViewChange?: (view: SettingsWorkspaceView) => void
  settingsNavItems?: { id: SettingsWorkspaceView; label: string }[]
  disabled?: boolean
}

const FEED_ITEMS: { id: FeedWorkspaceView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visual', label: 'Visual editor' },
  { id: 'json', label: 'JSON editor' },
  { id: 'sorting', label: 'Sorting' },
]

const INGESTION_ITEMS: { id: IngestionWorkspaceView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visual', label: 'Visual editor' },
  { id: 'json', label: 'JSON editor' },
  { id: 'prefilter', label: 'Prefilter' },
]

const MARKETPLACE_ITEMS: { id: MarketplaceWorkspaceView; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'installed', label: 'Subscriptions' },
]

const COLLECTION_ITEMS: { id: CollectionWorkspaceView; label: string }[] = [
  { id: 'blocks', label: 'My collection' },
  { id: 'developer_guide', label: 'Plugin developer guide' },
]

const SETTINGS_ITEMS: { id: SettingsWorkspaceView; label: string }[] = [
  { id: 'publishing', label: 'Publishing' },
  { id: 'ingest', label: 'Ingest' },
  { id: 'pool', label: 'Pool & lists' },
  { id: 'labelers', label: 'Labelers' },
  { id: 'enrichment', label: 'Enrichment' },
  { id: 'access', label: 'Access' },
  { id: 'developer', label: 'Developer' },
]

export function WorkspaceNav({
  mode,
  contextLabel,
  feedView = 'overview',
  ingestionView = 'overview',
  marketplaceView = 'browse',
  settingsView = 'publishing',
  settingsNavItems,
  onFeedViewChange,
  onIngestionViewChange,
  onMarketplaceViewChange,
  onVerifyPublisherClick,
  showVerifyPublisher = false,
  onNewLogicBlockClick,
  onNewCustomCodeClick,
  collectionView = 'blocks',
  onCollectionViewChange,
  onOpenDeveloperGuide,
  onSettingsViewChange,
  disabled = false,
}: Props) {
  const settingsItems = settingsNavItems ?? SETTINGS_ITEMS
  const items =
    mode === 'feed'
      ? FEED_ITEMS.map((item) => ({
          id: item.id,
          label: item.label,
          active: feedView === item.id,
          onClick: () => onFeedViewChange?.(item.id),
        }))
      : mode === 'marketplace'
        ? MARKETPLACE_ITEMS.map((item) => ({
            id: item.id,
            label: item.label,
            active: marketplaceView === item.id,
            onClick: () => onMarketplaceViewChange?.(item.id),
          }))
        : mode === 'collection'
          ? COLLECTION_ITEMS.map((item) => ({
              id: item.id,
              label: item.label,
              active: collectionView === item.id,
              onClick: () => onCollectionViewChange?.(item.id),
            }))
          : mode === 'settings'
          ? settingsItems.map((item) => ({
              id: item.id,
              label: item.label,
              active: settingsView === item.id,
              onClick: () => onSettingsViewChange?.(item.id),
            }))
          : INGESTION_ITEMS.map((item) => ({
              id: item.id,
              label: item.label,
              active: ingestionView === item.id,
              onClick: () => onIngestionViewChange?.(item.id),
            }))

  const modeLabel =
    mode === 'feed'
      ? 'Feed'
      : mode === 'marketplace'
        ? 'Marketplace'
        : mode === 'collection'
          ? 'Collection'
          : mode === 'settings'
            ? 'Settings'
            : 'Ingestion'

  return (
    <nav className="sidebar workspace-nav" aria-label="Workspace views">
      <div className="sidebar-head workspace-nav-head">
        <div className="sidebar-head-text">
          <h2>{modeLabel}</h2>
          <span className="sidebar-head-sub">{contextLabel}</span>
        </div>
      </div>

      <ul className="workspace-nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`workspace-nav-item${item.active ? ' active' : ''}`}
              disabled={disabled}
              aria-current={item.active ? 'page' : undefined}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {mode === 'marketplace' && showVerifyPublisher ? (
        <footer className="sidebar-footer workspace-nav-footer">
          <ul className="sidebar-global-nav">
            <li>
              <button
                type="button"
                className={`sidebar-global-item${marketplaceView === 'verify' ? ' active' : ''}`}
                aria-current={marketplaceView === 'verify' ? 'page' : undefined}
                onClick={() => onVerifyPublisherClick?.()}
              >
                Verify publisher
              </button>
            </li>
          </ul>
        </footer>
      ) : null}

      {mode === 'collection' ? (
        <footer className="sidebar-footer workspace-nav-footer">
          <ul className="sidebar-global-nav">
            <li>
              <button
                type="button"
                className="sidebar-global-item"
                onClick={() => onNewLogicBlockClick?.()}
              >
                New logic block
              </button>
            </li>
            <li>
              <button
                type="button"
                className="sidebar-global-item"
                onClick={() => onNewCustomCodeClick?.()}
              >
                New custom code
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-global-item${collectionView === 'developer_guide' ? ' active' : ''}`}
                onClick={() => onOpenDeveloperGuide?.()}
              >
                Plugin developer guide
              </button>
            </li>
          </ul>
        </footer>
      ) : null}
    </nav>
  )
}

export function WorkspaceNavShell({
  mode,
  contextLabel,
}: {
  mode: WorkspaceMode
  contextLabel: string
}) {
  const labels =
    mode === 'feed'
      ? FEED_ITEMS.map((i) => i.label)
      : mode === 'marketplace'
        ? MARKETPLACE_ITEMS.map((i) => i.label)
        : mode === 'collection'
          ? COLLECTION_ITEMS.map((i) => i.label)
          : mode === 'settings'
            ? SETTINGS_ITEMS.map((i) => i.label)
            : INGESTION_ITEMS.map((i) => i.label)

  const modeLabel =
    mode === 'feed'
      ? 'Feed'
      : mode === 'marketplace'
        ? 'Marketplace'
        : mode === 'collection'
          ? 'Collection'
          : mode === 'settings'
            ? 'Settings'
            : 'Ingestion'

  return (
    <nav className="sidebar workspace-nav" aria-label="Workspace views" aria-busy="true">
      <div className="sidebar-head workspace-nav-head">
        <div className="sidebar-head-text">
          <h2>{modeLabel}</h2>
          <span className="sidebar-head-sub">{contextLabel}</span>
        </div>
      </div>
      <ul className="workspace-nav-list">
        {labels.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              className={`workspace-nav-item${i === 0 ? ' active' : ''}`}
              disabled
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
