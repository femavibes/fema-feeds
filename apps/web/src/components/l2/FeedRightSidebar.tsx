import { useState } from 'react'
import type { FeedConfig, ProjectL1Config } from '@cfb/core-types'
import { FeedActionsBar } from './FeedActionsBar'
import { FeedDeployIntro } from './FeedDeployIntro'
import { FeedL2Form } from './FeedL2Form'
import { L2MatchPoolPanel } from './L2MatchPoolPanel'
import { FeedPublishPanel } from './FeedPublishPanel'

type SidebarTab = 'deploy' | 'feed' | 'settings'
type SettingsAutosaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface Props {
  feedDraft: FeedConfig
  liveFeed: FeedConfig | null
  hasUnpublishedDraft: boolean
  busy: boolean
  settingsDirty: boolean
  settingsAutosaveState: SettingsAutosaveState
  settingsSaving: boolean
  onBusyChange: (busy: boolean) => void
  onFeedChange: (next: FeedConfig) => void
  onSettingsChange: (next: FeedConfig) => void
  onSaveSettings: () => void
  onLiveUpdated: (live: FeedConfig, hasUnpublishedDraft: boolean, project?: ProjectL1Config) => void
  onNotify: (message: string | null, error: string | null) => void
  onOpenPublishingSettings?: () => void
  onPublishStateChange?: (published: boolean) => void
  onDeleteFeed: () => void
}

function settingsAutosaveLabel(state: SettingsAutosaveState): string | null {
  if (state === 'pending' || state === 'saving') return 'Autosaving settings…'
  if (state === 'saved') return 'Settings autosaved'
  if (state === 'error') return 'Autosave failed — save manually'
  return 'Unsaved settings — autosaving'
}

export function FeedRightSidebar({
  feedDraft,
  liveFeed,
  hasUnpublishedDraft,
  busy,
  settingsDirty,
  settingsAutosaveState,
  settingsSaving,
  onBusyChange,
  onFeedChange,
  onSettingsChange,
  onSaveSettings,
  onLiveUpdated,
  onNotify,
  onOpenPublishingSettings,
  onPublishStateChange,
  onDeleteFeed,
}: Props) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('deploy')

  return (
    <aside className="sidebar sidebar-right" aria-label="Feed actions">
      <div className="sidebar-head">
        <div className="sidebar-head-text">
          <h2>Actions</h2>
          <span className="sidebar-head-sub">{feedDraft.name}</span>
        </div>
      </div>

      <div
        className="sidebar-panel-tabs sidebar-panel-tabs--triple"
        role="tablist"
        aria-label="Feed sidebar"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'deploy'}
          className={`sidebar-panel-tab${sidebarTab === 'deploy' ? ' active' : ''}`}
          onClick={() => setSidebarTab('deploy')}
        >
          Deploy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'feed'}
          className={`sidebar-panel-tab${sidebarTab === 'feed' ? ' active' : ''}`}
          onClick={() => setSidebarTab('feed')}
        >
          Feed
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarTab === 'settings'}
          className={`sidebar-panel-tab${sidebarTab === 'settings' ? ' active' : ''}`}
          onClick={() => setSidebarTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="sidebar-scroll">
        {sidebarTab === 'deploy' && (
          <section className="sidebar-block feed-deploy-panel">
            <FeedDeployIntro feedId={feedDraft.feedId} />
            <FeedActionsBar
              feedDraft={feedDraft}
              liveFeed={liveFeed}
              hasUnpublishedDraft={hasUnpublishedDraft}
              busy={busy}
              onBusyChange={onBusyChange}
              onFeedChange={onFeedChange}
              onLiveUpdated={onLiveUpdated}
              onNotify={onNotify}
              layout="sidebar"
            />
            <FeedPublishPanel
              feedId={feedDraft.feedId}
              livePublished={Boolean(liveFeed?.published)}
              onOpenPublishingSettings={onOpenPublishingSettings}
              onPublishStateChange={onPublishStateChange}
              layout="sidebar"
            />
          </section>
        )}

        <section className="sidebar-block feed-sidebar-feed" hidden={sidebarTab !== 'feed'}>
          <L2MatchPoolPanel
            draft={feedDraft}
            match={feedDraft.match}
            active={sidebarTab === 'feed'}
            compact
            variant="feed"
          />
        </section>

        {sidebarTab === 'settings' && (
          <section className="sidebar-block">
            <p className="card-hint feed-settings-sidebar-hint">
              Name, pool scope, and active status. Changes autosave to your draft.
            </p>
            <FeedL2Form
              draft={feedDraft}
              onChange={onSettingsChange}
              compact
              sidebar
            />
            {settingsDirty ? (
              <div className="feed-settings-sidebar-status">
                <span className="badge badge-warn">Unsaved</span>
                <span className="card-hint">
                  {settingsAutosaveLabel(settingsAutosaveState)}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm sidebar-action-btn"
                  disabled={settingsSaving}
                  onClick={onSaveSettings}
                >
                  {settingsSaving ? 'Saving…' : 'Save now'}
                </button>
              </div>
            ) : (
              <p className="card-hint feed-settings-sidebar-saved">Settings saved to draft</p>
            )}
          </section>
        )}
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="btn btn-danger btn-sm sidebar-foot-btn"
          disabled={busy || settingsSaving}
          onClick={onDeleteFeed}
        >
          Delete feed
        </button>
      </div>
    </aside>
  )
}

export function FeedRightSidebarShell({
  feedName,
  feedId,
}: {
  feedName?: string
  feedId: string
}) {
  return (
    <aside className="sidebar sidebar-right" aria-label="Feed actions" aria-busy="true">
      <div className="sidebar-head">
        <div className="sidebar-head-text">
          <h2>Actions</h2>
          <span className="sidebar-head-sub">{feedName ?? feedId}</span>
        </div>
      </div>

      <div
        className="sidebar-panel-tabs sidebar-panel-tabs--triple"
        role="tablist"
        aria-label="Feed sidebar"
      >
        <button type="button" role="tab" aria-selected className="sidebar-panel-tab active" disabled>
          Deploy
        </button>
        <button type="button" role="tab" aria-selected={false} className="sidebar-panel-tab" disabled>
          Feed
        </button>
        <button type="button" role="tab" aria-selected={false} className="sidebar-panel-tab" disabled>
          Settings
        </button>
      </div>

      <div className="sidebar-scroll">
        <section className="sidebar-block">
          <p className="card-hint sidebar-loading-hint">Loading feed…</p>
        </section>
      </div>

      <div className="sidebar-foot">
        <button type="button" className="btn btn-danger btn-sm sidebar-foot-btn" disabled>
          Delete feed
        </button>
      </div>
    </aside>
  )
}
