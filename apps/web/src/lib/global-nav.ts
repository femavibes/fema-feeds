export type GlobalNavId = 'marketplace' | 'collection' | 'settings'

export type BuilderSection = 'project' | GlobalNavId

export const GLOBAL_NAV_ITEMS: { id: GlobalNavId; label: string }[] = [
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'collection', label: 'My collection' },
  { id: 'settings', label: 'Settings' },
]
