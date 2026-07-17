import { useCallback, useEffect, useState } from 'react'
import type { EnrichmentSettings, FeedConfig, ProjectL1Config } from '@cfb/core-types'
import {
  api,
  type AuthUser,
  type IngestStats,
  type LabelerSource,
  type ListCacheEntry,
} from './api/client'
import { ProjectSidebar } from './components/ProjectSidebar'
import { useProjectSidebarRail } from './hooks/useProjectSidebarRail'
import { ProjectWorkspace } from './components/ProjectWorkspace'
import { MarketplaceWorkspace } from './components/MarketplaceWorkspace'
import { CommunityWorkspace } from './components/CommunityWorkspace'
import { CollectionWorkspace } from './components/CollectionWorkspace'
import { SettingsWorkspace } from './components/SettingsWorkspace'
import { IngestStatusPill } from './components/IngestStatusPill'
import { LoginScreen } from './components/LoginScreen'
import { MasterOnboardingModal } from './components/MasterOnboardingModal'
import { UserMenu } from './components/UserMenu'
import { emptyProject } from './lib/l1-form'
import { emptyFeed } from './lib/l2-form'
import { CreateFeedModal, type FeedLogicFields } from './components/l2/CreateFeedModal'
import { ConfirmModal } from './components/ConfirmModal'
import { mergeCompiledIngestFromServer } from './lib/project-ingest'
import { projectConfigsEqual } from './lib/project-draft'
import type { BuilderSection, CfbAppProfile } from './lib/global-nav'
import type { SettingsWorkspaceView } from './lib/workspace-views'

const MASTER_ONBOARDING_DISMISS_KEY = 'cfb_master_onboarding_dismissed'

type FeedListItem = FeedConfig & { hasUnpublishedDraft?: boolean }

function isAuthenticatedUser(user: AuthUser | null): user is AuthUser {
  return Boolean(user?.did)
}

export function App() {
  const [authReady, setAuthReady] = useState(false)
  const [loginRequired, setLoginRequired] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [projects, setProjects] = useState<ProjectL1Config[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProjectL1Config | null>(null)
  const [savedProject, setSavedProject] = useState<ProjectL1Config | null>(null)
  const [feeds, setFeeds] = useState<FeedListItem[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [builderSection, setBuilderSection] = useState<BuilderSection>('project')
  const projectSidebarRail = useProjectSidebarRail(builderSection)
  const [stats, setStats] = useState<IngestStats | null>(null)
  const [listCache, setListCache] = useState<ListCacheEntry[]>([])
  const [labelers, setLabelers] = useState<LabelerSource[]>([])
  const [enrichment, setEnrichment] = useState<EnrichmentSettings | null>(null)
  const [highlightPublishingSettings, setHighlightPublishingSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showMasterOnboarding, setShowMasterOnboarding] = useState(false)
  const [settingsInitialView, setSettingsInitialView] = useState<SettingsWorkspaceView | undefined>()
  const [appProfile, setAppProfile] = useState<CfbAppProfile>('feedbuilder')
  const [showCreateFeedModal, setShowCreateFeedModal] = useState(false)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)
  const [createFeedSourceLogic, setCreateFeedSourceLogic] = useState<FeedLogicFields | null>(null)
  const [createFeedSourceLabel, setCreateFeedSourceLabel] = useState<string | null>(null)
  const [mobileProjectsOpen, setMobileProjectsOpen] = useState(false)

  const checkMasterOnboarding = useCallback(async (isMaster: boolean) => {
    if (!isMaster) return
    if (localStorage.getItem(MASTER_ONBOARDING_DISMISS_KEY) === '1') return
    const res = await api.getDeploymentAccess().catch(() => null)
    if (res?.isMaster && res.access.allowedDids.length === 0) {
      setShowMasterOnboarding(true)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const status = await api.authStatus().catch(() => ({
        oauthConfigured: false,
        oauthPublicUrl: null,
        appPasswordLogin: false,
        loginRequired: false,
      }))
      setLoginRequired(status.loginRequired)
      if (status.loginRequired) {
        const me = await api.authMe().catch(() => ({ user: null, isMaster: false, isGlobalVerifier: false }))
        setUser(me.user?.did ? { ...me.user, isMaster: me.isMaster, isGlobalVerifier: me.isGlobalVerifier } : null)
      } else {
        setUser(null)
      }
      setAuthReady(true)
    })()
  }, [])

  useEffect(() => {
    void api
      .globalMarketplaceStatus()
      .then((status) => {
        setAppProfile(status.appProfile)
        if (status.appProfile === 'registry') {
          setBuilderSection((current) => (current === 'project' ? 'marketplace' : current))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user?.isMaster) return
    void checkMasterOnboarding(true)
  }, [user?.did, user?.isMaster, checkMasterOnboarding])

  useEffect(() => {
    document.title = appProfile === 'registry' ? 'CFB Marketplace' : 'WaffleHouseIndex'
    const link = document.querySelector('link[rel=icon]') as HTMLLinkElement | null
    if (link) link.href = appProfile === 'registry' ? '/marketplace-icon.svg' : '/fema.jpg'
  }, [appProfile])

  const dismissMasterOnboarding = () => {
    localStorage.setItem(MASTER_ONBOARDING_DISMISS_KEY, '1')
    setShowMasterOnboarding(false)
  }

  const openAccessSettings = () => {
    setSettingsInitialView('access')
    setBuilderSection('settings')
    setShowMasterOnboarding(false)
  }

  const loadDeployment = useCallback(async () => {
    const [statsRes, cacheRes, labelersRes, enrichmentRes] = await Promise.all([
      api.stats().catch(() => null),
      api.listCache().catch(() => ({ lists: [] })),
      api.listLabelers().catch(() => ({ labelers: [] })),
      api.getEnrichmentSettings().catch(() => null),
    ])
    setStats(statsRes)
    setListCache(cacheRes.lists)
    setLabelers(labelersRes.labelers)
    setEnrichment(enrichmentRes?.settings ?? null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { projects: list } = await api.listProjects()
      setProjects(list)
      await loadDeployment()
      return list
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      return []
    } finally {
      setLoading(false)
    }
  }, [loadDeployment])

  const notify = useCallback((msg: string | null, err: string | null) => {
    setMessage(msg)
    setError(err)
  }, [])

  useEffect(() => {
    if (!authReady || (loginRequired && !isAuthenticatedUser(user))) return
    void load().then((list) => {
      setSelectedId((prev) => prev ?? list[0]?.projectId ?? null)
    })
  }, [load, authReady, loginRequired, user])

  useEffect(() => {
    if (!authReady || (loginRequired && !isAuthenticatedUser(user))) return
    if (!selectedId) {
      setDraft(null)
      return
    }
    void api.getProject(selectedId).then(
      ({ project }) => {
        const clone = structuredClone(project)
        setDraft(clone)
        setSavedProject(clone)
      },
      () => {
        setDraft(null)
        setSavedProject(null)
      },
    )
  }, [selectedId, authReady, loginRequired, user])

  const loadFeeds = useCallback(async (projectId: string) => {
    const { feeds: list } = await api.listFeeds(projectId)
    setFeeds(list)
    setSelectedFeedId((prev) => (prev && list.some((f) => f.feedId === prev) ? prev : null))
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setFeeds([])
      setSelectedFeedId(null)
      return
    }
    void loadFeeds(selectedId).catch((e) => {
      setError(e instanceof Error ? e.message : 'Failed to load feeds')
    })
  }, [selectedId, loadFeeds])

  const projectDirty =
    draft && savedProject ? !projectConfigsEqual(draft, savedProject) : false

  const confirmDiscardProjectChanges = (): boolean => {
    if (!projectDirty) return true
    return window.confirm(
      'You have unsaved ingestion pool changes. Discard them and switch projects?',
    )
  }

  const selectProject = (projectId: string) => {
    if (projectId === selectedId) {
      setSelectedFeedId(null)
      setBuilderSection('project')
      return
    }
    if (!confirmDiscardProjectChanges()) return
    setSelectedId(projectId)
    setSelectedFeedId(null)
    setBuilderSection('project')
  }

  const selectFeed = (feedId: string | null) => {
    setSelectedFeedId(feedId)
    if (feedId) {
      setBuilderSection('project')
    }
  }

  const openBuilderSection = (section: BuilderSection) => {
    if (section === builderSection) return
    if (section !== 'project' && !confirmDiscardProjectChanges()) return
    setBuilderSection(section)
    if (section !== 'project') {
      setSelectedFeedId(null)
    }
    if (section === 'settings') {
      void loadDeployment()
    }
  }

  // Listen for clone events from community workspace
  useEffect(() => {
    const handler = (e: Event) => {
      const { logic, label } = (e as CustomEvent).detail
      setCreateFeedSourceLogic(logic ?? null)
      setCreateFeedSourceLabel(label ?? null)
      setShowCreateFeedModal(true)
    }
    window.addEventListener('cfb:clone-feed', handler)
    return () => window.removeEventListener('cfb:clone-feed', handler)
  }, [])

  // Mobile: workspace nav bars host their own hamburger and signal via event.
  useEffect(() => {
    const handler = () => setMobileProjectsOpen((v) => !v)
    window.addEventListener('cfb:toggle-projects', handler)
    return () => window.removeEventListener('cfb:toggle-projects', handler)
  }, [])

  if (!authReady) {
    return <div className="app app-loading">Loading…</div>
  }

  if (loginRequired && !isAuthenticatedUser(user)) {
    return (
      <div className="app">
        <LoginScreen
          onLoggedIn={(u) => {
            setUser(u)
            if (u.isMaster) void checkMasterOnboarding(true)
          }}
        />
      </div>
    )
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const { project } = await api.saveProject(draft)
      const clone = structuredClone(project)
      setDraft(clone)
      setSavedProject(clone)
      setProjects((prev) =>
        prev.map((p) => (p.projectId === project.projectId ? project : p)),
      )
      setMessage('Saved')
      await loadDeployment()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!draft) return
    setConfirmDeleteProject(false)
    const label = draft.name || draft.projectId
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      // Auto-unpublish all published feeds in this project
      const publishedFeeds = feeds.filter((f) => f.published)
      for (const f of publishedFeeds) {
        await api.unpublishFeed(f.feedId).catch(() => null)
      }
      await api.deleteProject(draft.projectId)
      const remaining = projects.filter((p) => p.projectId !== draft.projectId)
      setProjects(remaining)
      setSelectedId(remaining[0]?.projectId ?? null)
      setFeeds([])
      setSelectedFeedId(null)
      setDraft(null)
      setSavedProject(null)
      setMessage(`Deleted ${label}`)
      await loadDeployment()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (projectId: string, name: string) => {
    setError(null)
    try {
      const { project } = await api.createProject(emptyProject(projectId, name))
      setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId(project.projectId)
      setSelectedFeedId(null)
      setBuilderSection('project')
      setMessage(`Created ${project.name}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    }
  }

  const handleCreateFeed = async (feedId: string, name: string) => {
    if (!draft) return
    setError(null)
    setMessage(null)
    try {
      const { feed } = await api.createFeed(emptyFeed(draft.projectId, feedId, name, draft.pinnedLogicBlock))
      setFeeds((prev) => [...prev, feed].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedFeedId(feed.feedId)
      setBuilderSection('project')
      setMessage(`Created feed ${feed.name}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create feed failed')
    }
  }

  const handleCreateFeedFromModal = async (feed: FeedConfig, avatarFile?: File) => {
    setError(null)
    setMessage(null)
    const { feed: created } = await api.createFeed(feed)
    if (avatarFile) {
      await api.uploadFeedAvatar(created.feedId, avatarFile).catch(() => null)
    }
    setFeeds((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedFeedId(created.feedId)
    setBuilderSection('project')
    setShowCreateFeedModal(false)
    setCreateFeedSourceLogic(null)
    setCreateFeedSourceLabel(null)
    setMessage(`Created feed ${created.name}`)
  }

  const openCreateFeedModal = (sourceLogic?: FeedLogicFields | null, sourceLabel?: string | null) => {
    setCreateFeedSourceLogic(sourceLogic ?? null)
    setCreateFeedSourceLabel(sourceLabel ?? null)
    setShowCreateFeedModal(true)
  }

  const listCacheForProject = listCache.filter((l) => l.projectId === selectedId)

  const workspaceSubtitle =
    appProfile === 'registry'
      ? 'Global marketplace registry'
      : builderSection === 'settings'
      ? 'Deployment settings'
      : builderSection === 'community'
        ? 'Community'
        : builderSection === 'marketplace'
          ? 'Marketplace'
          : builderSection === 'collection'
            ? 'My collection'
            : draft
              ? draft.name
              : 'Select a project'

  return (
    <div
      className={`app${appProfile === 'registry' ? ' app-registry' : ''}${
        mobileProjectsOpen ? ' mobile-projects-open' : ''
      }`}
    >
      <header className="app-header" title="App.tsx">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label={mobileProjectsOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileProjectsOpen}
          onClick={() => setMobileProjectsOpen((v) => !v)}
        >
          ☰
        </button>
        <button
          type="button"
          className="brand brand-home"
          onClick={() => setBuilderSection(appProfile === 'registry' ? 'marketplace' : 'project')}
          aria-label={appProfile === 'registry' ? 'Back to marketplace' : 'Back to projects'}
        >
          {appProfile === 'registry'
            ? <img className="brand-mark brand-mark-img" src="/marketplace-icon.svg" alt="Marketplace" />
            : <img className="brand-mark brand-mark-img" src="/fema.jpg" alt="WaffleHouseIndex" />}
          <div>
            <h1>{appProfile === 'registry' ? 'FEMA Marketplace' : 'WaffleHouseIndex' /* WIP app name */}</h1>
            <p>{workspaceSubtitle}</p>
          </div>
        </button>
        <div className="header-controls">
          {user ? <UserMenu user={user} onLogout={() => setUser(null)} /> : null}
          {appProfile !== 'registry' ? (
            <IngestStatusPill isMaster={!loginRequired || Boolean(user?.isMaster)} />
          ) : null}
        </div>
      </header>

      {(message || error) && (
        <div className={`banner ${error ? 'banner-error' : 'banner-ok'}`}>
          <span className="banner-text">{error ?? message}</span>
          <div className="banner-actions">
            {error ? (
              <button type="button" className="banner-btn" onClick={() => void load()}>
                Retry
              </button>
            ) : null}
            <button
              type="button"
              className="banner-btn"
              aria-label="Dismiss"
              onClick={() => {
                setError(null)
                setMessage(null)
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="app-body">
        <div
          className={`mobile-projects-backdrop${mobileProjectsOpen ? ' open' : ''}`}
          aria-hidden
          onClick={() => setMobileProjectsOpen(false)}
        />
        <ProjectSidebar
          projects={projects}
          selectedId={selectedId}
          loading={loading}
          feeds={feeds}
          selectedFeedId={selectedFeedId}
          builderSection={builderSection}
          projectsOpen={projectSidebarRail.projectsOpen || mobileProjectsOpen}
          onToggleProjects={projectSidebarRail.toggleProjects}
          onResizeStart={projectSidebarRail.startResize}
          sidebarStyle={projectSidebarRail.sidebarStyle}
          onSelect={(id) => {
            setMobileProjectsOpen(false)
            selectProject(id)
          }}
          onSelectFeed={(feedId) => {
            setMobileProjectsOpen(false)
            selectFeed(feedId)
          }}
          onGlobalNavSelect={(section) => {
            setMobileProjectsOpen(false)
            openBuilderSection(section)
          }}
          onCreate={handleCreate}
          onCreateFeed={(id, name) => void handleCreateFeed(id, name)}
          onOpenCreateFeedModal={() => openCreateFeedModal()}
          appProfile={appProfile}
        />

        <main
          className={`main-panel${
            builderSection === 'community' ||
            builderSection === 'marketplace' ||
            builderSection === 'collection' ||
            builderSection === 'settings' ||
            (builderSection === 'project' && draft)
              ? ' main-panel-feeds'
              : ''
          }`}
          title={
            builderSection === 'settings'
              ? 'SettingsWorkspace.tsx'
              : builderSection === 'community'
                ? 'CommunityWorkspace.tsx'
                : builderSection === 'marketplace'
                  ? 'MarketplaceWorkspace.tsx'
                  : builderSection === 'collection'
                    ? 'CollectionWorkspace.tsx'
                    : 'ProjectWorkspace.tsx'
          }
        >
          {builderSection === 'settings' ? (
            <SettingsWorkspace
              isMaster={Boolean(user?.isMaster)}
              initialView={settingsInitialView}
              stats={stats}
              listCache={listCache}
              labelers={labelers}
              enrichment={enrichment}
              highlightPublishing={highlightPublishingSettings}
              onRefresh={() => void loadDeployment()}
              onPollLists={async () => {
                await api.pollLists()
                await loadDeployment()
              }}
              onAddLabeler={async (did, name) => {
                await api.addLabeler(did, name)
                const res = await api.listLabelers()
                setLabelers(res.labelers)
              }}
              onToggleLabeler={async (did, enabled) => {
                await api.setLabelerEnabled(did, enabled)
                const res = await api.listLabelers()
                setLabelers(res.labelers)
              }}
              onDeleteLabeler={async (did) => {
                await api.deleteLabeler(did)
                const res = await api.listLabelers()
                setLabelers(res.labelers)
              }}
              onSaveEnrichment={async (patch) => {
                const res = await api.saveEnrichmentSettings(patch)
                setEnrichment(res.settings)
              }}
              onSaveFeedgen={async (patch) => {
                await api.saveFeedgenSettings(patch)
                setHighlightPublishingSettings(false)
              }}
            />
          ) : builderSection === 'community' ? (
            <CommunityWorkspace />
          ) : builderSection === 'marketplace' ? (
            <MarketplaceWorkspace />
          ) : builderSection === 'collection' && appProfile !== 'registry' ? (
            <CollectionWorkspace />
          ) : draft && appProfile !== 'registry' ? (
            <ProjectWorkspace
              draft={draft}
              projectDirty={projectDirty}
              feeds={feeds}
              feedId={selectedFeedId}
              onFeedsChange={setFeeds}
              onFeedIdChange={selectFeed}
              onProjectChange={setDraft}
              onProjectCompiled={(project) => {
                if (!draft || draft.projectId !== project.projectId) return
                const merge = (p: ProjectL1Config) => mergeCompiledIngestFromServer(p, project)
                setDraft((prev) => (prev ? merge(prev) : prev))
                setSavedProject((prev) => (prev ? merge(prev) : prev))
              }}
              listCache={listCache}
              onRefreshList={async (listId) => {
                await api.refreshList(listId)
                await loadDeployment()
              }}
              saving={saving}
              onSaveProject={() => void handleSave()}
              onDeleteProject={() => setConfirmDeleteProject(true)}
              onNotify={notify}
              onOpenPublishingSettings={() => {
                setHighlightPublishingSettings(true)
                openBuilderSection('settings')
              }}
              onCloneFeed={(feed) => openCreateFeedModal(
                { match: feed.match, rank: feed.rank, visualLayout: feed.visualLayout, injector: feed.injector, authorLists: feed.authorLists, sources: feed.sources, personalization: feed.personalization },
                feed.name,
              )}
            />
          ) : appProfile === 'registry' ? (
            <MarketplaceWorkspace />
          ) : (
            <div className="empty-state">
              {loading ? 'Loading…' : 'Select or create a project'}
            </div>
          )}
        </main>
      </div>

      {showCreateFeedModal && draft && (
        <CreateFeedModal
          projectId={draft.projectId}
          pinnedLogicBlock={draft.pinnedLogicBlock}
          onClose={() => { setShowCreateFeedModal(false); setCreateFeedSourceLogic(null); setCreateFeedSourceLabel(null) }}
          onCreate={(feed, avatarFile) => handleCreateFeedFromModal(feed, avatarFile)}
          sourceLogic={createFeedSourceLogic}
          sourceLabel={createFeedSourceLabel}
        />
      )}

      {showMasterOnboarding && (
        <MasterOnboardingModal
          onDismiss={dismissMasterOnboarding}
          onOpenAccessSettings={openAccessSettings}
          onWhitelistSaved={dismissMasterOnboarding}
        />
      )}

      {confirmDeleteProject && draft && (
        <ConfirmModal
          title="Delete project"
          message={
            <>
              <p>Delete project <strong>{draft.name || draft.projectId}</strong>?</p>
              <p>This removes the project config, all feeds in this project, and clears its posts from the pool. This cannot be undone.</p>
              {feeds.some((f) => f.published) && (
                <p className="card-hint">
                  {feeds.filter((f) => f.published).length} published feed(s) will be automatically unpublished from Bluesky.
                </p>
              )}
            </>
          }
          confirmLabel="Delete project"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDeleteProject(false)}
        />
      )}
    </div>
  )
}
