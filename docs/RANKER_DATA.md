# Ranker & feed intelligence data model

What CFB stores and passes to **custom code rankers** and **native** sorting/scoring features.

## Pipeline

```
Jetstream ingest → ingested_posts + post_engagement + author_profiles
                 → rank_snapshot (JSONB, at ingest)
Pool sort        → feed_candidates.sort_key (native L2 / sort packs)
Skeleton serve   → viewer JWT → viewer context + candidatePosts[] → ranker
                 → record served posts + feedContext / reqId
                 ← sendInteractions (seen / like / repost)
```

## Shipped today

### `ingested_posts.rank_snapshot` (migration 016)

Computed at ingest (`@cfb/post-normalize`):

| Field | Notes |
|-------|--------|
| `mediaType` | 0=text, 1=image, 2=video, 3=gif, 4=link, 5=quote |
| `hasAltText`, `textLength`, tag counts | From eval snapshot |
| `postKind`, `langs`, `embed`, `labelVals` | For filters + scoring |

### `candidatePosts[]` at serve time

Full `RankerCandidate` — engagement, author profile, media/tags/labels, nested `rankSnapshot`.

Manifest permission: `ranker:enriched_candidates`

Rankers that need NSFW or moderation signals should read **`labelVals`** (self-labels + subscribed labelers).

### Viewer context + impression log (migration 019)

When the Bluesky client sends an **Authorization** JWT on `getFeedSkeleton`:

| Table | Purpose |
|-------|---------|
| `viewer_follow_cache` | Cached follow graph (6h TTL, fetched from public PDS) |
| `feed_served_posts` | Served URIs per viewer + feed (demotion) |
| `viewer_post_interactions` | Likes/reposts/etc. from `sendInteractions` |

Ranker request fields:

- `viewerDid` — authenticated viewer
- `viewer.followedAuthorDids[]` — follows intersecting pool authors
- `viewer.servedPosts[]` — recent served rows for this feed
- `viewer.likedPostUris[]` / `repostedPostUris[]`

Skeleton response includes `reqId` and per-item `feedContext` (for interaction round-trip).

Endpoint: `POST /xrpc/app.bsky.feed.sendInteractions`

---

## Product backlog

| # | Feature | Status |
|---|---------|--------|
| **1** | **`viewerDid` + viewer context** | **Shipped** |
| **2** | **Feed interaction & impression log** | **Shipped** |
| **3** | ~~Interest tags~~ | Out of scope |
| **5** | **NSFW / moderation (labels)** | Shipped |

### Future

- Mutual-follow detection
- Prune job for stale impression rows
- Optional JWT signature verification (today: decode `sub` only)

---

## Reference plugin

`publisher-workspace/fema-personalized-rank/` — global + **viewer** scoring (following boost, served/liked demotion) when `viewer` is present on the ranker request.
