# Continue Session — WaffleIndex (Custom Feed Builder)

## First Steps
1. Read `docs/SESSION_CONTINUE.md` for full context on what was done and what's next
2. Read `docs/STRICT_INGEST_MODE.md` for the strict ingest mode design decisions
3. Read `docs/PURGE_SYSTEM.md` for purge system design

## Project Location
`D:\Custom Feed Builder` on Windows 11

## Immediate TODO (from last session)

### 1. Project Pool Tab (Right Sidebar) — NEXT UP
Add a "Pool" tab to the project right sidebar that shows posts currently in that project's pool.

**Key files to read:**
- `apps/web/src/components/ProjectWorkspace.tsx` — manages feed/project workspace, right sidebar
- `apps/web/src/components/l2/FeedRightSidebar.tsx` — the right sidebar for feeds (has Deploy/Feed/Settings tabs) — follow this pattern
- `apps/web/src/components/ProjectRightSidebar.tsx` — the existing project right sidebar (has Save/Test tabs)
- `apps/web/src/components/l2/L2MatchPoolPanel.tsx` — shows feed candidates with `PoolMatchSampleRow` — reuse this pattern
- `apps/web/src/components/l2/PoolMatchSampleRow.tsx` — post card component for pool posts
- `packages/storage-postgres/src/pool-post.ts` — has `listPostsForProject`, `countPostsForProject`
- `apps/api/src/app.ts` — may need a new endpoint or use existing ones

**What it should do:**
- New "Pool" tab on project right sidebar (between Save and Test, or as a new section)
- Shows recent posts in that project's pool
- Reuse `PoolMatchSampleRow` for rendering
- Show count at top
- Maybe basic filtering later

### 2. Other TODOs (lower priority)
- Post text truncation in visual editor matches panel
- Rename Rankers → Personalization in UI
- Ingest status per-project breakdown (real-time)
- Per-project purge policies

## Architecture Context

### Prefilter Modes (per-project)
- `manual` (default): User builds prefilter in visual editor. Default = keep unless blocked.
- `strict`: Auto-derived from feeds exclusively. Default = drop unless a feed's ingest-eligible logic matches. Project prefilter editor is NOT used in strict mode.

### Ingest Pipeline
```
Jetstream post arrives (75/sec)
  → Global prefilter (deployment_settings key='global_prefilter') — always runs
  → Per-project evaluation:
      Manual mode → standard L1 eval (project prefilter compiled gate)
      Strict mode → optimized strict gate (Aho-Corasick + language pre-check)
  → Posts that pass enter the pool (ingested_posts + ingested_post_projects)
  → L2 evaluates pool posts against feed rules → feed_candidates
  → Purge sweep cleans old/unused posts periodically
```

### Key Packages
- `packages/core-types/` — shared types (PurgePolicy, PrefilterMode, StrictGateMeta, etc.)
- `packages/l1-compile/` — prefilter compilation, strict mode extraction/compilation, Aho-Corasick
- `packages/l1-filters/` — ingest gate evaluation (`evaluateIngestGate`)
- `packages/ingest-runner/` — main ingest loop, strict gate runtime, purge sweep timer
- `packages/storage-postgres/` — all DB operations (pool, purge, deployment settings, etc.)
- `apps/api/` — Hono API server, all endpoints
- `apps/web/` — React SPA (Vite)

### Important Technical Notes
- CSS file has mixed line endings — PowerShell scripts work better than fsReplace for multi-line edits
- The `TermListEditor` key prop was recently fixed (was causing focus loss) — don't change it back to include term value
- Feed `enabled` toggle now saves directly to live file (not just draft) — this was a recent fix
- New feeds default to `enabled: true`
- Orphaned project files can cause permissive ingestion — the runner loads ALL project files regardless of ownerDid
- `deployment_settings` table stores: enrichment, access, global_prefilter, purge, deployment info
- Strict mode recompiles on feed create/update-live/delete + every 60s config reload
- Docker image auto-builds on push to main: `ghcr.io/femavibes/fema-feeds:latest`
- To update marketplace Docker: `docker compose -f docker-compose.marketplace.yml pull api && docker compose -f docker-compose.marketplace.yml up -d`

## App Branding
- Main app: "WaffleIndex" (WIP name), fema.jpg icon, fema.jpg favicon
- Marketplace: "FEMA Marketplace", marketplace-icon.svg (store icon), green background (#0f1f15)
- Browser tabs dynamically set via useEffect on appProfile
- `CFB_APP_PROFILE=registry` env var triggers marketplace/registry mode
