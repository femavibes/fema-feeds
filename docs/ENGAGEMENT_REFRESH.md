# Engagement Refresh System

## Problem

When ingestion is off (or after long downtime), engagement data (`post_engagement` table) becomes stale. Feeds using engagement-based sorting (like `like_count + repost_count * 2 + reply_count`) appear chronological because all posts have `sort_key = 0`.

## Root Cause Fix

**File:** `packages/l2-worker/src/process-post.ts`

The `composeSortKey` function now combines the formula score with a time-based tiebreaker:
```
sortKey = (indexedAt_in_hours_since_epoch) + formulaScore
```
- Posts with 0 engagement sort chronologically (time component only)
- Each engagement point = 1 hour of recency boost
- A post with 10 engagement points floats up as if it were 10 hours newer

## Three Layers of Engagement Data

1. **Initial backfill** — On ingest, calls `app.bsky.feed.getPosts` (25 URIs/call) for each new post
2. **Engagement WebSocket** — Separate Jetstream connection for `app.bsky.feed.like` + `app.bsky.feed.repost` creates. Only bumps posts already in pool.
3. **Periodic refresh** — Every 60s, fetches 25 oldest-updated posts (within 48h) from Bluesky API

## Engagement Catch-Up (NEW)

### Automatic (on ingest startup)

**File:** `packages/ingest-runner/src/runner.ts`

When ingestion starts (and enrichment + trackEngagement are enabled), automatically refreshes stale engagement for all posts in `feed_candidates` belonging to enabled feeds. Runs in background, doesn't block startup.

- Only refreshes posts with `post_engagement.updated_at` older than 60 minutes
- Rate-limited: 200ms delay between batches of 25
- Scope: ONLY posts in active feed candidates (L2 matched, smallest scope)

### Manual — Project Level (any logged-in user)

**API:** `POST /api/projects/:id/refresh-engagement`
**Auth:** Any user with project access
**UI Location:** Sidebar → Ingestion → Settings (per-project)

Refreshes engagement for all posts in the project's L1 pool (`ingested_post_projects`). Useful before enabling a new feed or after long downtime.

**Implemented** in `apps/api/src/app.ts` (after `purge-pool` route).

### Manual — Database Level (master account ONLY)

**API:** `POST /api/settings/refresh-engagement`
**Auth:** Deployment master account only (`requireMaster`)
**UI Location:** Sidebar → Settings → Pools & Lists

Refreshes engagement for ALL posts in ALL enabled feeds across the entire deployment. This is the broadest scope.

**Implemented** in `apps/api/src/app.ts` (after `purge/run` route).

### Worker CLI

```bash
# All enabled feeds (force refresh, staleMinutes=0)
node apps/worker/dist/main.js refresh-engagement

# Scoped to a project's feeds
node apps/worker/dist/main.js refresh-engagement --project=urbanism
```

## Storage Query

**File:** `packages/storage-postgres/src/feed-candidates.ts`

```sql
SELECT DISTINCT fc.post_uri
FROM feed_candidates fc
LEFT JOIN post_engagement pe ON pe.post_uri = fc.post_uri
WHERE fc.feed_id = ANY($1::text[])
  AND (pe.updated_at IS NULL OR pe.updated_at < NOW() - INTERVAL '1 minute' * $2)
ORDER BY fc.post_uri
LIMIT $3
```

## Rate Limits

- Bluesky `app.bsky.feed.getPosts`: 25 URIs per call
- Safe rate: ~10 req/sec (unauthenticated public API)
- 500k posts ≈ 33 minutes at full speed
- Default delay between batches: 200ms

## After Refresh: Reeval Required

After refreshing engagement data, you need to **reeval** to recompute sort keys:

```bash
node apps/worker/dist/main.js l2-reeval --project=urbanism
```

Or the API rebuild endpoint (already exists for feeds).

## UI Placement

| Scope | UI Location | Auth |
|-------|-------------|------|
| Feed (automatic) | No button needed — runs on ingest start | — |
| Project | Sidebar → Ingestion → Settings | Any user with project access |
| Database | Sidebar → Settings → Pools & Lists | Master account only |

## Files Modified

- `packages/l2-worker/src/process-post.ts` — composeSortKey fix
- `packages/storage-postgres/src/feed-candidates.ts` — getStaleFeedCandidateUris query
- `packages/storage-postgres/src/index.ts` — export
- `packages/ingest-runner/src/engagement-backfill.ts` — catchUpFeedEngagement function
- `packages/ingest-runner/src/index.ts` — export
- `packages/ingest-runner/src/runner.ts` — startup catch-up wiring
- `apps/worker/src/main.ts` — CLI command
- `apps/worker/package.json` — added @cfb/ingest-runner dep
