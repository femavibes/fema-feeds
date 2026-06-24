import { useEffect, useState } from 'react'
import type { EnrichmentSettings, FeedgenSettings } from '@cfb/core-types'

import type { LabelerSource, ListCacheEntry, IngestStats } from '../api/client'
import {
  DEFAULT_SETTINGS_VIEW,
  isMasterOnlySettingsView,
  settingsNavItemsForUser,
} from '../lib/settings-nav'
import type { SettingsWorkspaceView } from '../lib/workspace-views'

import { SettingsPage } from './SettingsPage'
import { WorkspaceNav } from './WorkspaceNav'

interface Props {
  isMaster: boolean
  initialView?: SettingsWorkspaceView
  stats: IngestStats | null
  listCache: ListCacheEntry[]
  labelers: LabelerSource[]
  enrichment: EnrichmentSettings | null
  highlightPublishing?: boolean
  onRefresh: () => void
  onPollLists: () => Promise<void>
  onAddLabeler: (did: string, name: string) => Promise<void>
  onToggleLabeler: (did: string, enabled: boolean) => Promise<void>
  onDeleteLabeler: (did: string) => Promise<void>
  onSaveEnrichment: (patch: Partial<EnrichmentSettings>) => Promise<void>
  onSaveFeedgen: (patch: Partial<FeedgenSettings>) => Promise<void>
}

export function SettingsWorkspace({
  isMaster,
  initialView,
  highlightPublishing,
  ...props
}: Props) {
  const [view, setView] = useState<SettingsWorkspaceView>(initialView ?? DEFAULT_SETTINGS_VIEW)
  const navItems = settingsNavItemsForUser(isMaster)

  useEffect(() => {
    if (initialView) setView(initialView)
  }, [initialView])

  useEffect(() => {
    if (highlightPublishing) {
      setView('publishing')
    }
  }, [highlightPublishing])

  useEffect(() => {
    if (!isMaster && isMasterOnlySettingsView(view)) {
      setView(DEFAULT_SETTINGS_VIEW)
    }
  }, [isMaster, view])

  return (
    <div className="project-workspace project-workspace--settings">
      <WorkspaceNav
        mode="settings"
        contextLabel="Deployment"
        settingsView={view}
        settingsNavItems={navItems}
        onSettingsViewChange={setView}
      />

      <main className="l2-main-panel">
        <SettingsPage
          view={view}
          isMaster={isMaster}
          highlightPublishing={highlightPublishing}
          {...props}
        />
      </main>
    </div>
  )
}
