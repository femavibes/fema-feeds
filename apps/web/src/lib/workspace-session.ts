import type { BuilderSection } from './global-nav'
import type { FeedWorkspaceView } from './workspace-views'

const KEY = 'cfb.workspace.session'

export interface WorkspaceSession {
  builderSection: BuilderSection
  projectId: string | null
  feedId: string | null
  feedView: FeedWorkspaceView
}

const FEED_VIEWS = new Set<FeedWorkspaceView>([
  'overview',
  'visual',
  'json',
  'sorting',
  'personalization',
  'injectors',
  'sources',
  'intelligence',
])

const BUILDER_SECTIONS = new Set<BuilderSection>([
  'project',
  'settings',
  'community',
  'marketplace',
  'collection',
])

function isFeedView(v: unknown): v is FeedWorkspaceView {
  return typeof v === 'string' && FEED_VIEWS.has(v as FeedWorkspaceView)
}

function isBuilderSection(v: unknown): v is BuilderSection {
  return typeof v === 'string' && BUILDER_SECTIONS.has(v as BuilderSection)
}

export function readWorkspaceSession(): WorkspaceSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WorkspaceSession>
    return {
      builderSection: isBuilderSection(parsed.builderSection) ? parsed.builderSection : 'project',
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      feedId: typeof parsed.feedId === 'string' ? parsed.feedId : null,
      feedView: isFeedView(parsed.feedView) ? parsed.feedView : 'overview',
    }
  } catch {
    return null
  }
}

export function writeWorkspaceSession(patch: Partial<WorkspaceSession>): void {
  try {
    const prev = readWorkspaceSession() ?? {
      builderSection: 'project' as BuilderSection,
      projectId: null,
      feedId: null,
      feedView: 'overview' as FeedWorkspaceView,
    }
    const next: WorkspaceSession = {
      builderSection: patch.builderSection ?? prev.builderSection,
      projectId: patch.projectId !== undefined ? patch.projectId : prev.projectId,
      feedId: patch.feedId !== undefined ? patch.feedId : prev.feedId,
      feedView: patch.feedView ?? prev.feedView,
    }
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private mode
  }
}
