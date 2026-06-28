# Custom Feed Builder (WaffleIndex) — Continue from Session 6/28/2026

Self-hostable Bluesky custom feed platform. See `docs/PLAN.md` and `README.md`.

## Project Location
`D:\Custom Feed Builder` on Windows 11

## Dev Scripts
- `dev-restart.bat` — kills ports 3000+5173, restarts both (no rebuild)
- `dev-rebuild.bat` — kills both, full rebuild (all packages + web), restarts both
- `dev-api-rebuild.bat` — kills port 3000, rebuilds API packages only, restarts API
- `dev-stop.bat` — kills both ports

Port 3000 = API + production web build (Cloudflare tunnel points here)
Port 5173 = Vite hot-reload (local dev only, proxies API to 3000)

## Docker (marketplace deployment)
```
cd /d D:\Custom Feed Builder\deploy
docker compose -f docker-compose.marketplace.yml pull api
docker compose -f docker-compose.marketplace.yml up -d
```
Marketplace runs on port 3005 (Cloudflare tunnel routes marketplace.fema.monster → localhost:3005)
Image is `ghcr.io/femavibes/fema-feeds:latest` — auto-built on push to main via GitHub Actions.

## Git Workflow
```
cd /d "D:\Custom Feed Builder"
git add -A && git commit -m "description" && git push origin main
```

## Architecture Summary
- Packages: monorepo with `packages/` (shared libs) and `apps/` (api, web, ingest, worker)
- L1: Project-level ingestion filters. Posts from Jetstream evaluated per-project independently.
- L2: Feed-level rules. Visual editor graph with conditions, groups, sort formulas.
- Pool: Posts matching L1 enter the pool. Feeds evaluate L2 against pool posts.
- Multi-user: Projects/feeds scoped by ownerDid. Single Jetstream connection for all users.
- Publishing: All users on a deployment share the master's publicBaseUrl. Feeds publish under the logged-in user's DID.
- OAuth: Fully implemented.

## Technical Notes
- OS: Windows 11
- Package type: ESM ("type": "module")
- Native Postgres (not Docker) for dev
- CSS file (`apps/web/src/styles/app.css`) has mixed line endings — use PowerShell scripts for multi-line edits (fsReplace often fails on this file)
- `deployment_settings` table: key/value store for deployment-wide config (enrichment, access, global_prefilter, purge)
- `user_settings` table: per-user key/value (keys: 'feedgen', 'preferences')
- API responses have `Cache-Control: no-store` to prevent Cloudflare caching
- App name: "WaffleIndex" (WIP — placeholder name)
- Marketplace name: "FEMA Marketplace" / "CFB Marketplace" (browser tab)

## What Was Done This Session (6/28/2026)

### 1. Global Prefilter System ✓
- Deployment-wide filter that runs BEFORE any project L1 rules
- Storage: `deployment_settings` key='global_prefilter' (same `ProjectPrefilter` shape)
- API: `GET/PUT /api/settings/global-prefilter` (master-only)
- Ingest runner: evaluates global prefilter before per-project loop using `evaluateIngestGate()`
- New exported function `evaluateIngestGate()` in `@cfb/l1-filters` for standalone gate evaluation
- UI: Settings → Ingest has "Edit global prefilter" button → fullscreen visual/JSON editor
- `GlobalPrefilterEditor.tsx` component (same editor as project prefilters)
- `MergedPrefilterPanel` shows global rules with "Global" badge

### 2. Purge System ✓
- `PurgePolicy` types in `packages/core-types/src/purge.ts`
- Storage: `packages/storage-postgres/src/purge.ts` (getGlobalPurgeSettings, saveGlobalPurgeSettings, runPurgeSweep)
- Dry run scans ALL eligible posts (no batch limit); real run loops in batches of 1000
- Background sweep timer in ingest runner (configurable interval, starts with ingest)
- API: `GET/PUT /api/settings/purge`, `POST /api/settings/purge/run`
- Settings → Purge tab (master-only) with ToggleRow, rule cards, dry run/run now
- Purge conditions: notInFeed, isOrphan, postKind, hasMedia, labeledNsfw, isTextOnly, minEditorScore, minLikes/minReposts/minQuotes/minReplies
- `notInFeed` is the killer feature — purges posts not in any feed's candidates

### 3. Strict Ingest Mode ✓ (Full Implementation)
- Design doc: `docs/STRICT_INGEST_MODE.md`
- Per-project `prefilterMode: 'manual' | 'strict'` field
- **Manual mode** (default): user-built prefilter, keep unless blocked
- **Strict mode**: auto-derived from feeds exclusively, drop unless wanted
- Extraction: `packages/l1-compile/src/strict-extract.ts` — walks feed graph, extracts ingest-eligible include paths, skips excludes
- Logic block resolution: resolves `logic_block_ref` nodes recursively
- Compilation: `packages/l1-compile/src/strict-compile.ts` — combines all feeds' paths into project gate
- Optimized evaluation: `packages/l1-compile/src/strict-gate-optimize.ts`
  - Aho-Corasick automaton (`packages/l1-compile/src/aho-corasick.ts`) for single-pass multi-pattern keyword scan
  - Language pre-check hoisting (eliminates 70-90% of firehose immediately)
  - Evaluation order: cheap checks first (language → post_kind → embed → hashtags → keywords → regex)
- Runtime: `packages/ingest-runner/src/strict-gate.ts` — builds gates on reload, evaluates per-post
- Runner splits configs: manual projects → standard L1 eval; strict projects → strict gate only
- Recompiles on feed create/update-live/delete via `apps/api/src/strict-recompile.ts`
- Also recompiles on 60s config reload (catches logic block updates)
- UI: project overview page has Manual/Strict dropdown + metadata display (path count, contributing feeds)
- URL node added as ingest-eligible type (patterns + sources)
- **Tested and confirmed working**: 0 false matches over 2600+ posts with keyword-only gate

### 4. Registry Mode Visual Distinction ✓
- `.app-registry` CSS class on app root when appProfile='registry'
- Dark green background (#0f1f15 bg, #142a1b header, #1e4d2b border)
- Marketplace uses store SVG icon next to "FEMA Marketplace" text
- Main app uses fema.jpg icon next to "WaffleIndex" text
- Browser tab: "CFB Marketplace" (registry) / "WaffleIndex" (normal)
- Favicons: marketplace-icon.svg (registry) / fema.jpg (normal)
- Dynamic `document.title` + favicon swap via useEffect on appProfile

### 5. Pool Management ✓
- `POST /api/projects/:id/purge-pool` endpoint — deletes all pool posts for a project
- Project workspace → Settings tab (new, below Prefilter): "Delete project pool" button
- Settings → Pool & Lists: per-project breakdown table with delete button per project
- Project overview: shows per-project pool count + total pool count

### 6. Bug Fixes ✓
- **Feed visual editor losing focus**: `TermListEditor` had `key={\`${index}-${term}\`}` which remounted on every keystroke. Fixed to `key={index}`
- **Feed enabled toggle not sticking**: draft save was forcing `enabled: live.enabled`. Now persists enabled change to live feed file immediately
- **New feeds created inactive**: `emptyFeed()` had `enabled: false`. Changed to `enabled: true`
- **Orphaned project "dd"**: file existed on disk but wasn't visible in UI (different ownerDid). Was ingesting everything with empty permissive gate. Deleted file + cleaned pool.
- **Removed legacy author blocklist** from project overview (redundant with prefilter editor)

## TODO Next Session

### 1. Project Pool Tab (Right Sidebar)
- Add "Pool" tab to project right sidebar (between Save and Test)
- Show recent posts in that project's pool (from `ingested_post_projects` + `ingested_posts`)
- Reuse `PoolMatchSampleRow` component for rendering
- Count at top + maybe basic filtering (post kind, has media, etc.)

### 2. Post Text Truncation in Visual Editor Matches Panel
- CSS fix applied but text may still appear truncated
- Investigate `.l2-inspector-panel` overflow chain

### 3. Rename Rankers → Personalization in UI
- Marketplace browse tab labels
- Feed workspace tabs
- Component labels/copy

### 4. Ingest Status Per-Project Breakdown
- Settings → Ingest status could show real-time per-project pass rates
- Show strict vs manual breakdown

### 5. Purge System Enhancements
- Per-project purge policies (from PURGE_SYSTEM.md)
- Multi-project protection logic (post only purged when ALL projects agree)
- Purge stats (last sweep time, total purged lifetime)

### 6. Multi-Registry Federation (Future)
- Allow other deployments to run their own registries alongside the canonical one
- Registry discovery, trust chains
- UI for browsing multiple registries

## Key Files Reference (Updated)
| File | Purpose |
|------|---------|
| `packages/core-types/src/purge.ts` | PurgePolicy, PurgeCondition, GlobalPurgeSettings types |
| `packages/core-types/src/strict-ingest.ts` | PrefilterMode, StrictGateMeta types |
| `packages/storage-postgres/src/purge.ts` | Purge sweep logic + settings storage |
| `packages/storage-postgres/src/deployment-settings.ts` | Global prefilter + deployment settings storage |
| `packages/l1-compile/src/strict-extract.ts` | Feed graph → ingest-eligible include paths |
| `packages/l1-compile/src/strict-compile.ts` | Combine feeds → project strict gate |
| `packages/l1-compile/src/strict-gate-optimize.ts` | Optimized evaluator (Aho-Corasick + language pre-check) |
| `packages/l1-compile/src/aho-corasick.ts` | Multi-pattern substring search automaton |
| `packages/l1-filters/src/ingest-gate.ts` | `evaluateIngestGate()` + ingest gate evaluation |
| `packages/ingest-runner/src/strict-gate.ts` | Runtime strict gate build + evaluation |
| `packages/ingest-runner/src/runner.ts` | Main ingest loop (global prefilter + strict/manual split) |
| `apps/api/src/strict-recompile.ts` | Fire-and-forget strict gate recompile helper |
| `apps/api/src/app.ts` | Global prefilter + purge + purge-pool API endpoints |
| `apps/api/src/feeds.ts` | Feed CRUD + strict recompile triggers |
| `apps/web/src/components/GlobalPrefilterEditor.tsx` | Fullscreen global prefilter editor |
| `apps/web/src/components/PurgeSettingsSection.tsx` | Purge settings UI |
| `apps/web/src/components/ProjectSettingsPage.tsx` | Project settings tab (delete pool) |
| `apps/web/src/components/IngestionOverview.tsx` | Project overview (mode toggle, pool counts) |
| `apps/web/src/components/TermListEditor.tsx` | Keyword/hashtag term editor (fixed focus bug) |
| `apps/web/public/fema.jpg` | Brand icon (both modes) |
| `apps/web/public/marketplace-icon.svg` | Marketplace store icon (registry mode) |
| `docs/STRICT_INGEST_MODE.md` | Full strict ingest mode design doc |
| `docs/PURGE_SYSTEM.md` | Purge system design doc |
