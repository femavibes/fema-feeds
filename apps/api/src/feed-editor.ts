import type { FeedConfig } from '@cfb/core-types'
import { draftsDiffer } from '@cfb/core-types'
import { loadFeed } from '@cfb/feed-config'
import type { Pool } from '@cfb/storage-postgres'
import { getFeedDraft } from '@cfb/storage-postgres'

export interface FeedEditorState {
  live: FeedConfig
  draft: FeedConfig | null
  editor: FeedConfig
  hasUnpublishedDraft: boolean
}

export async function loadFeedEditorState(
  feedsDir: string,
  feedId: string,
  pool: Pool | null,
): Promise<FeedEditorState> {
  const live = await loadFeed(feedsDir, feedId)
  const storedDraft = pool ? await getFeedDraft(pool, feedId) : null
  const draft = storedDraft
    ? {
        ...storedDraft,
        feedId: live.feedId,
        projectId: live.projectId,
        ownerDid: live.ownerDid,
        enabled: live.enabled,
        published: live.published,
        publishedAt: live.publishedAt,
        liveAt: live.liveAt,
        publishedUri: live.publishedUri,
      }
    : null
  const editor = draft ?? JSON.parse(JSON.stringify(live)) as FeedConfig
  const hasUnpublishedDraft = draft ? draftsDiffer(live, draft) : false
  return { live, draft, editor, hasUnpublishedDraft }
}
