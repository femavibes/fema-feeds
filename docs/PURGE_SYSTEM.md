# Post Purge & Global Prefilter System — Design & Implementation Plan

## Overview

Two deployment-wide controls for the ingestion pipeline, both master-only:

1. **Global Prefilter** — rejects posts BEFORE any project L1 rules run. "Don't let junk in."
2. **Global Purge** — removes posts from the pool after they age out or prove low-value. "Clean up what got in."

Both follow the same authority model: **global overrides projects.** Projects work within the boundaries the master sets.

---

## Global Prefilter

### Concept
A deployment-wide filter that runs first in the ingest pipeline. If a post fails the global prefilter, it's dropped immediately — never evaluated against any project's L1 rules, never enters the pool.

### Authority Model
- Global says NO → post is rejected, period. Projects can't override.
- Global says YES (or has no opinion) → post proceeds to per-project L1 evaluation.
- Projects can only FURTHER restrict within what global allows.

### Use Cases
- Block known spam/bot accounts (deployment-wide block list)
- Minimum text length (no empty or one-word posts)
- Language restrictions (English-only deployment)
- Content policy (SFW deployment blocks NSFW labels)
- Minimum author follower count (kills fresh bot accounts)
- Exclude posts that are only mentions/links (spam patterns)

### Pipeline Order
```
Jetstream post arrives
  → Global prefilter (master rules)
    → FAIL: dropped, never enters pool
    → PASS: evaluate against each project's L1 rules
      → Project A L1: match → enters pool tagged for Project A
      → Project B L1: no match → not tagged for Project B
```

### Configuration
- Same rule types as project prefilters (restrict/exclude/include)
- Uses the SAME visual editor as project prefilters
- Stored in deployment settings (master-only)
- **UI location: TBD** — needs access to the visual editor. Options to discuss:
  - Settings → Ingest with a "Edit global prefilter" button that opens the visual editor?
  - A top-level section in the sidebar (like projects but for "Global")?
  - Inside the existing Merged Prefilter Panel?
  - ASK USER: where does this feel right given the existing workspace layout?
- Shown in Merged Prefilter Panel with "Global" badge

### Performance
Free performance gain — rejecting posts before the per-project loop means less work overall. With N projects, every post rejected by global saves N evaluations.

---

## Global Purge & Per-Project Purge

### Concept

Automatic purging of old/low-value posts from the ingestion pool to manage database size. Two levels:

1. **Global purge rules** (deployment-wide, master-only) — hard ceiling, overrides everything
2. **Per-project purge policies** (optional) — allows earlier purging with conditions

### Authority Model
- Global purge says delete at 7 days → post is gone, regardless of what projects want
- Per-project can request EARLIER purging (e.g. 2 days for a chronological feed)
- Per-project CANNOT keep posts alive longer than global allows
- A post is only purged by per-project rules when ALL projects it belongs to agree

### Core Rules

## Purge Policy Schema

Both global and per-project use the same structure:

```typescript
interface PurgeRule {
  afterHours: number          // age threshold
  condition?: PurgeCondition  // if omitted = unconditional at this age
}

interface PurgeCondition {
  maxEngagement?: number      // likes + reposts + replies < N
  maxLikes?: number
  maxReposts?: number
  // extensible — add more fields as needed
}

interface PurgePolicy {
  rules: PurgeRule[]          // evaluated in order, first match = purgeable
}
```

Example global:
```json
{
  "rules": [
    { "afterHours": 168, "condition": { "maxEngagement": 5 } },
    { "afterHours": 336 }
  ]
}
```
Translation: after 7 days, purge if engagement < 5. After 14 days, purge unconditionally.

Example per-project (chronological feed):
```json
{
  "rules": [
    { "afterHours": 48 }
  ]
}
```
Translation: this project is done with posts after 2 days.

Example per-project (trending/FYP feed):
```json
{
  "rules": [
    { "afterHours": 6, "condition": { "maxEngagement": 3 } },
    { "afterHours": 24, "condition": { "maxEngagement": 10 } },
    { "afterHours": 168 }
  ]
}
```

## Multi-Project Protection Logic

When evaluating per-project purge:
1. Get all project IDs for the post (`ingested_post_projects`)
2. For each project, evaluate its purge policy against the post
3. If ANY project says "keep" (no rule matched), the post is NOT purged
4. Only purge when ALL projects agree OR global max age is exceeded

Global max age always wins — it's the hard disk-space ceiling.

## Purge Sweep Runner

Periodic background task (configurable interval, default 30 min):

1. **Fast filter**: query posts where `indexed_at < NOW() - global_min_age` (cheapest possible index scan)
2. **Check global rules**: evaluate global conditions (engagement thresholds via `post_engagement` table)
3. **Check per-project rules**: for posts not globally purgeable yet, check if all projects agree
4. **Batch delete**: `DELETE FROM ingested_posts WHERE post_uri = ANY($1)` — cascade handles `feed_candidates` and `ingested_post_projects`
5. **Dry-run mode**: same logic but only counts/reports, doesn't delete

## Settings UI

### Global (Settings → Pool or new "Purge" tab, master-only)
- Enable/disable auto-purge
- Purge rules editor (same visual as per-project)
- Sweep interval (minutes)
- "Run purge now" button
- "Dry run" button (shows what would be purged)
- Stats: posts purged last sweep, total purged lifetime

### Per-Project (Project settings or ingestion workspace)
- Optional purge policy toggle
- Purge rules editor
- Dry run for this project's posts only

## Database Changes

May need:
- Add `purge_policy` JSONB column to project config (or keep in the JSON file — project configs are files today)
- Global purge settings in `deployment_settings` or a new key in `user_settings` (master, key='purge')
- Ensure foreign key cascades exist: `ingested_post_projects.post_uri` and `feed_candidates.post_uri` should CASCADE on delete from `ingested_posts`
- Check if cascades already exist or need a migration

## Key Files to Reference

| File | Purpose |
|------|---------|
| `packages/storage-postgres/src/pool-post.ts` | `ingested_posts` queries, `listAllPoolPosts`, etc. |
| `packages/storage-postgres/src/feed-candidates.ts` | `feed_candidates` table operations |
| `packages/storage-postgres/src/post-engagement.ts` | Engagement data (like/repost counts) |
| `packages/storage-postgres/src/project-cleanup.ts` | Existing `deleteProjectData` — similar pattern |
| `packages/storage-postgres/src/stats.ts` | `pruneExpiredPosts` — existing basic purge (just age-based) |
| `packages/storage-postgres/src/ingest.ts` | `persistL1Matches` — where posts enter the pool |
| `packages/ingest-runner/src/runner.ts` | Ingest loop — could hook sweep here or run separately |
| `packages/core-types/src/` | Add `PurgePolicy` type here |
| `apps/api/src/app.ts` | API routes for settings |
| `apps/web/src/components/SettingsPage.tsx` | Global purge UI |
| `apps/web/src/components/ProjectIngestionWorkspace.tsx` | Per-project purge UI |
| `database/migrations/` | Any needed schema changes |

## Existing Purge Logic

`packages/storage-postgres/src/stats.ts` exports `pruneExpiredPosts` — this is a simple age-based prune that already exists. The new system replaces/extends this with conditional logic.

Check if `ingested_posts` has ON DELETE CASCADE on related tables, or if we need to manually clean up `ingested_post_projects` and `feed_candidates`.

## Implementation Order

### Global Prefilter
1. Add global prefilter config type to `core-types` (same shape as project prefilters)
2. Storage: store in `user_settings` (master, key='global_prefilter') or deployment settings
3. Ingest runner: evaluate global prefilter BEFORE per-project loop
4. API endpoints: GET/PUT global prefilter
5. Settings UI: Settings → Ingest section for global prefilter editor
6. Merged Prefilter Panel: show global rules with "Global" badge

### Purge System
1. Add `PurgePolicy` type to `core-types`
2. Migration: ensure cascade deletes on `ingested_post_projects` and `feed_candidates`
3. Storage functions: `evaluatePurgeEligibility`, `purgeEligiblePosts`, `dryRunPurge`
4. Global purge settings: store in `user_settings` (master, key='purge') 
5. Per-project purge policy: add to `ProjectL1Config` type + project JSON files
6. Purge sweep runner (background, like engagement refresh)
7. API endpoints: GET/PUT settings, POST run-now, POST dry-run
8. Settings UI: global purge tab
9. Per-project UI: purge policy editor in project settings
10. Hook into ingest runner or run as separate interval

## Open Design Decisions

- Sweep interval: configurable or fixed 30 min?
- Should `editor_score > 0` exempt posts from early purge? (User said: make it a condition flag, not hardcoded)
- Per-project policy in the JSON config file or in the database? (Probably config file since that's where project settings live)
