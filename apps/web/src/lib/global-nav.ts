export type GlobalNavId = 'community' | 'marketplace' | 'collection' | 'settings'

export type BuilderSection = 'project' | GlobalNavId

export type CfbAppProfile = 'feedbuilder' | 'registry'

export const GLOBAL_NAV_ITEMS: { id: GlobalNavId; label: string }[] = [
  { id: 'community', label: 'Community' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'collection', label: 'My collection' },
  { id: 'settings', label: 'Settings' },
]

export const REGISTRY_NAV_ITEMS: { id: GlobalNavId; label: string }[] = [
  { id: 'community', label: 'Community' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'settings', label: 'Settings' },
]
