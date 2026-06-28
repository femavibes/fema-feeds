import type { SettingsWorkspaceView } from './workspace-views'

export const SETTINGS_NAV_ITEMS: { id: SettingsWorkspaceView; label: string }[] = [
  { id: 'user', label: 'User' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'ingest', label: 'Ingest' },
  { id: 'pool', label: 'Pool & lists' },
  { id: 'purge', label: 'Purge' },
  { id: 'labelers', label: 'Labelers' },
  { id: 'enrichment', label: 'Enrichment' },
  { id: 'access', label: 'Access' },
  { id: 'developer', label: 'Developer' },
]

const MASTER_ONLY_VIEWS = new Set<SettingsWorkspaceView>([
  'ingest',
  'purge',
  'labelers',
  'enrichment',
  'access',
  'developer',
])

export function settingsNavItemsForUser(isMaster: boolean) {
  if (isMaster) return SETTINGS_NAV_ITEMS
  return SETTINGS_NAV_ITEMS.filter((item) => !MASTER_ONLY_VIEWS.has(item.id))
}

export function isMasterOnlySettingsView(view: SettingsWorkspaceView): boolean {
  return MASTER_ONLY_VIEWS.has(view)
}

export const DEFAULT_SETTINGS_VIEW: SettingsWorkspaceView = 'publishing'
