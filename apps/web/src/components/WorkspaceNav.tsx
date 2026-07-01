import type {
  CollectionWorkspaceView,
  FeedWorkspaceView,
  IngestionWorkspaceView,
  MarketplaceProductScope,
  MarketplaceWorkspaceView,
  SettingsWorkspaceView,
} from '../lib/workspace-views'
import { MarketplaceProductNavList } from './marketplace/MarketplaceProductNavList'

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
  marketplaceProductKind?: MarketplaceProductScope
  onMarketplaceProductKindChange?: (kind: MarketplaceProductScope) => void
  onVerifyPublisherClick?: () => void
  showVerifyPublisher?: boolean
  onModerateListingsClick?: () => void
  showModerateListings?: boolean
  onNewLogicBlockClick?: () => void
  onNewCustomCodeClick?: () => void
  collectionView?: CollectionWorkspaceView
  onCollectionViewChange?: (view: CollectionWorkspaceView) => void
  collectionProductKind?: MarketplaceProductScope
  onCollectionProductKindChange?: (kind: MarketplaceProductScope) => void
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
  { id: 'personalization', label: 'Personalization' },
  { id: 'injectors', label: 'Injectors' },
  { id: 'sources', label: 'Sources' },
]

const INGESTION_ITEMS: { id: IngestionWorkspaceView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visual', label: 'Visual editor' },
  { id: 'json', label: 'JSON editor' },
  { id: 'prefilter', label: 'Prefilter' },
  { id: 'settings', label: 'Settings' },
]

const MARKETPLACE_ITEMS: { id: MarketplaceWorkspaceView; label: string }[] = [
  { id: 'browse', label: 'Browse' },
  { id: 'installed', label: 'Subscriptions' },
]

const COLLECTION_ITEMS: { id: CollectionWorkspaceView; label: string }[] = [
  { id: 'blocks', label: 'My collection' },
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
  marketplaceProductKind = 'all',
  onMarketplaceProductKindChange,
  onVerifyPublisherClick,
  showVerifyPublisher = false,
  onModerateListingsClick,
  showModerateListings = false,
  onNewLogicBlockClick,
  onNewCustomCodeClick,
  collectionView = 'blocks',
  onCollectionViewChange,
  collectionProductKind = 'all',
  onCollectionProductKindChange,
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
        ? []
        : mode === 'collection'
          ? []
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
        {mode === 'marketplace' ? (
          <>
            <li className="workspace-nav-tree-item">
              <button
                type="button"
                className={`workspace-nav-item${marketplaceView === 'browse' ? ' active' : ''}`}
                disabled={disabled}
                aria-current={marketplaceView === 'browse' ? 'page' : undefined}
                aria-expanded={marketplaceView === 'browse'}
                onClick={() => {
                  onMarketplaceViewChange?.('browse')
                  onMarketplaceProductKindChange?.('all')
                }}
              >
                <span className="workspace-nav-tree-label">
                  {marketplaceView === 'browse' ? '▾ ' : '▸ '}
                  Browse
                </span>
              </button>
              {marketplaceView === 'browse' ? (
                <MarketplaceProductNavList
                  ariaLabel="Browse categories"
                  overviewLabel="Featured"
                  activeKind={marketplaceProductKind}
                  onSelect={(kind) => {
                    onMarketplaceViewChange?.('browse')
                    onMarketplaceProductKindChange?.(kind)
                  }}
                />
              ) : null}
            </li>
            <li className="workspace-nav-tree-item">
              <button
                type="button"
                className={`workspace-nav-item${marketplaceView === 'installed' ? ' active' : ''}`}
                disabled={disabled}
                aria-current={marketplaceView === 'installed' ? 'page' : undefined}
                aria-expanded={marketplaceView === 'installed'}
                onClick={() => {
                  onMarketplaceViewChange?.('installed')
                  onMarketplaceProductKindChange?.('all')
                }}
              >
                <span className="workspace-nav-tree-label">
                  {marketplaceView === 'installed' ? '▾ ' : '▸ '}
                  Subscriptions
                </span>
              </button>
              {marketplaceView === 'installed' ? (
                <MarketplaceProductNavList
                  ariaLabel="Subscription categories"
                  overviewLabel="All"
                  activeKind={marketplaceProductKind}
                  onSelect={(kind) => {
                    onMarketplaceViewChange?.('installed')
                    onMarketplaceProductKindChange?.(kind)
                  }}
                />
              ) : null}
            </li>
          </>
        ) : mode === 'collection' ? (
          <>
            <li className="workspace-nav-tree-item">
              <button
                type="button"
                className={`workspace-nav-item${collectionView === 'blocks' ? ' active' : ''}`}
                disabled={disabled}
                aria-current={collectionView === 'blocks' ? 'page' : undefined}
                aria-expanded={collectionView === 'blocks'}
                onClick={() => {
                  onCollectionViewChange?.('blocks')
                  onCollectionProductKindChange?.('all')
                }}
              >
                <span className="workspace-nav-tree-label">
                  {collectionView === 'blocks' ? '▾ ' : '▸ '}
                  My collection
                </span>
              </button>
              {collectionView === 'blocks' ? (
                <MarketplaceProductNavList
                  ariaLabel="Collection categories"
                  overviewLabel="All"
                  activeKind={collectionProductKind}
                  onSelect={(kind) => {
                    onCollectionViewChange?.('blocks')
                    onCollectionProductKindChange?.(kind)
                  }}
                />
              ) : null}
            </li>
          </>
        ) : (
          items.map((item) => (
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
          ))
        )}
      </ul>

      {mode === 'marketplace' && (showVerifyPublisher || showModerateListings) ? (
        <footer className="sidebar-footer workspace-nav-footer">
          <ul className="sidebar-global-nav">
            {showModerateListings ? (
              <li>
                <button
                  type="button"
                  className={`sidebar-global-item${marketplaceView === 'moderate' ? ' active' : ''}`}
                  aria-current={marketplaceView === 'moderate' ? 'page' : undefined}
                  onClick={() => onModerateListingsClick?.()}
                >
                  Moderate listings
                </button>
              </li>
            ) : null}
            {showVerifyPublisher ? (
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
            ) : null}
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
