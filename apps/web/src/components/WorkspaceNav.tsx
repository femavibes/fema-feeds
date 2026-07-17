import { useState } from 'react'
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
  onTaxonomyClick?: () => void
  showTaxonomy?: boolean
  onNewLogicBlockClick?: () => void
  onNewCustomCodeClick?: () => void
  collectionView?: CollectionWorkspaceView
  onCollectionViewChange?: (view: CollectionWorkspaceView) => void
  collectionProductKind?: MarketplaceProductScope
  onCollectionProductKindChange?: (kind: MarketplaceProductScope) => void
  onOpenDeveloperGuide?: () => void
  onSettingsViewChange?: (view: SettingsWorkspaceView) => void
  settingsNavItems?: { id: SettingsWorkspaceView; label: string }[]
  ingestionNavItems?: { id: IngestionWorkspaceView; label: string }[]
  disabled?: boolean
}

// Pipeline group in pipeline order: sources feed the pool → sorting →
// personalization → injectors (ads / pinned posts run last).
const FEED_ITEMS: { id: FeedWorkspaceView; label: string; dividerBefore?: boolean }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visual', label: 'Visual editor', dividerBefore: true },
  { id: 'json', label: 'JSON editor' },
  { id: 'sources', label: 'Sources', dividerBefore: true },
  { id: 'sorting', label: 'Sorting' },
  { id: 'personalization', label: 'Personalization' },
  { id: 'injectors', label: 'Injectors' },
  { id: 'intelligence', label: 'Intelligence', dividerBefore: true },
]

const INGESTION_ITEMS: { id: IngestionWorkspaceView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visual', label: 'Visual editor' },
  { id: 'json', label: 'JSON editor' },
  { id: 'prefilter', label: 'Prefilter' },
  { id: 'settings', label: 'Settings' },
  { id: 'intelligence', label: 'Intelligence' },
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
  { id: 'backfill', label: 'Backfill' },
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
  onTaxonomyClick,
  showTaxonomy = false,
  onNewLogicBlockClick,
  onNewCustomCodeClick,
  collectionView = 'blocks',
  onCollectionViewChange,
  collectionProductKind = 'all',
  onCollectionProductKindChange,
  onOpenDeveloperGuide,
  onSettingsViewChange,
  ingestionNavItems,
  disabled = false,
}: Props) {
  const settingsItems = settingsNavItems ?? SETTINGS_ITEMS
  const ingestionItems = ingestionNavItems ?? INGESTION_ITEMS
  // Mobile: nav collapses to a "current view" bar; tapping expands the menu.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const items =
    mode === 'feed'
      ? FEED_ITEMS.map((item) => ({
          id: item.id,
          label: item.label,
          dividerBefore: item.dividerBefore,
          active: feedView === item.id,
          onClick: () => {
            setMobileMenuOpen(false)
            onFeedViewChange?.(item.id)
          },
        }))
      : mode === 'marketplace'
        ? []
        : mode === 'collection'
          ? []
          : mode === 'settings'
          ? settingsItems.map((item) => ({
              id: item.id,
              label: item.label,
              dividerBefore: false,
              active: settingsView === item.id,
              onClick: () => {
                setMobileMenuOpen(false)
                onSettingsViewChange?.(item.id)
              },
            }))
          : ingestionItems.map((item) => ({
              id: item.id,
              label: item.label,
              dividerBefore: false,
              active: ingestionView === item.id,
              onClick: () => {
                setMobileMenuOpen(false)
                onIngestionViewChange?.(item.id)
              },
            }))

  const activeLabel =
    mode === 'marketplace'
      ? marketplaceView === 'installed'
        ? 'Subscriptions'
        : 'Browse'
      : mode === 'collection'
        ? 'My collection'
        : items.find((item) => item.active)?.label ?? 'Views'

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

  // Mobile bar: signal what kind of thing is selected ("Project" reads
  // better than "Ingestion" next to the hamburger).
  const mobileContextLabel = mode === 'ingestion' ? 'Project' : modeLabel

  return (
    <nav
      className={`sidebar workspace-nav workspace-nav--${mode}${mobileMenuOpen ? ' mobile-menu-open' : ''}`}
      aria-label="Workspace views"
    >
      <div className="sidebar-head workspace-nav-head" title="WorkspaceNav.tsx">
        <div className="sidebar-head-text">
          <h2>{modeLabel}</h2>
          <span className="sidebar-head-sub">{contextLabel}</span>
        </div>
      </div>

      <div className="workspace-nav-mobile-bar">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Open navigation"
          onClick={() => window.dispatchEvent(new CustomEvent('cfb:toggle-projects'))}
        >
          ☰
        </button>
        <span className="workspace-nav-mobile-context">{mobileContextLabel}</span>
        <button
          type="button"
          className="workspace-nav-current"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <span className="workspace-nav-current-caret" aria-hidden>
            {mobileMenuOpen ? '▾' : '▴'}
          </span>
          {activeLabel}
          <span className="workspace-nav-current-caret" aria-hidden>
            {mobileMenuOpen ? '▾' : '▴'}
          </span>
        </button>
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
                    setMobileMenuOpen(false)
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
                    setMobileMenuOpen(false)
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
                    setMobileMenuOpen(false)
                    onCollectionViewChange?.('blocks')
                    onCollectionProductKindChange?.(kind)
                  }}
                />
              ) : null}
            </li>
          </>
        ) : (
          items.map((item) => (
            <li key={item.id} className={item.dividerBefore ? 'workspace-nav-item-divided' : undefined}>
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

      {mode === 'marketplace' && (showVerifyPublisher || showModerateListings || showTaxonomy) ? (
        <footer className="sidebar-footer workspace-nav-footer">
          <ul className="sidebar-global-nav">
            {showModerateListings ? (
              <li>
                <button
                  type="button"
                  className={`sidebar-global-item${marketplaceView === 'moderate' ? ' active' : ''}`}
                  aria-current={marketplaceView === 'moderate' ? 'page' : undefined}
                  onClick={() => { setMobileMenuOpen(false); onModerateListingsClick?.() }}
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
                  onClick={() => { setMobileMenuOpen(false); onVerifyPublisherClick?.() }}
                >
                  Verify publisher
                </button>
              </li>
            ) : null}
            {showTaxonomy ? (
              <li>
                <button
                  type="button"
                  className={`sidebar-global-item${marketplaceView === 'taxonomy' ? ' active' : ''}`}
                  aria-current={marketplaceView === 'taxonomy' ? 'page' : undefined}
                  onClick={() => { setMobileMenuOpen(false); onTaxonomyClick?.() }}
                >
                  Categories & Tags
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
                onClick={() => { setMobileMenuOpen(false); onNewLogicBlockClick?.() }}
              >
                New logic block
              </button>
            </li>
            <li>
              <button
                type="button"
                className="sidebar-global-item"
                onClick={() => { setMobileMenuOpen(false); onNewCustomCodeClick?.() }}
              >
                New custom code
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-global-item${collectionView === 'developer_guide' ? ' active' : ''}`}
                onClick={() => { setMobileMenuOpen(false); onOpenDeveloperGuide?.() }}
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
      ? FEED_ITEMS.map((i) => ({ label: i.label, dividerBefore: i.dividerBefore }))
      : mode === 'marketplace'
        ? MARKETPLACE_ITEMS.map((i) => ({ label: i.label, dividerBefore: false }))
        : mode === 'collection'
          ? COLLECTION_ITEMS.map((i) => ({ label: i.label, dividerBefore: false }))
          : mode === 'settings'
            ? SETTINGS_ITEMS.map((i) => ({ label: i.label, dividerBefore: false }))
            : INGESTION_ITEMS.map((i) => ({ label: i.label, dividerBefore: false }))

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
    <nav className={`sidebar workspace-nav workspace-nav--${mode}`} aria-label="Workspace views" aria-busy="true">
      <div className="workspace-nav-mobile-bar">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Open navigation"
          onClick={() => window.dispatchEvent(new CustomEvent('cfb:toggle-projects'))}
        >
          ☰
        </button>
        <span className="workspace-nav-mobile-context">
          {mode === 'ingestion' ? 'Project' : mode === 'feed' ? 'Feed' : ''}
        </span>
        <button type="button" className="workspace-nav-current" disabled>
          <span className="workspace-nav-current-caret" aria-hidden>
            ▴
          </span>
          Loading…
          <span className="workspace-nav-current-caret" aria-hidden>
            ▴
          </span>
        </button>
      </div>
      <div className="sidebar-head workspace-nav-head" title="WorkspaceNav.tsx">
        <div className="sidebar-head-text">
          <h2>{modeLabel}</h2>
          <span className="sidebar-head-sub">{contextLabel}</span>
        </div>
      </div>
      <ul className="workspace-nav-list">
        {labels.map((item, i) => (
          <li key={item.label} className={item.dividerBefore ? 'workspace-nav-item-divided' : undefined}>
            <button
              type="button"
              className={`workspace-nav-item${i === 0 ? ' active' : ''}`}
              disabled
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
