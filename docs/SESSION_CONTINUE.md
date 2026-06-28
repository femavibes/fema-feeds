# Custom Feed Builder — Continue from Session [DATE]

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

After backend/package code changes: `dev-api-rebuild.bat` (or `dev-rebuild.bat` if web UI also changed)
Vite hot-reloads frontend changes automatically on 5173 (no restart needed)
Cloudflare sees port 3000 — needs `dev-rebuild.bat` to update what external users see.

## Docker (marketplace deployment)
```
cd /d D:\Custom Feed Builder\deploy
docker compose -f docker-compose.marketplace.yml up -d
docker compose -f docker-compose.marketplace.yml down
docker compose -f docker-compose.marketplace.yml pull && docker compose -f docker-compose.marketplace.yml up -d
```
Marketplace runs on port 3005 (Cloudflare tunnel routes marketplace.fema.monster → localhost:3005)

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
- OAuth: Fully implemented. Uses master's publicBaseUrl from `user_settings` (key='feedgen') for client metadata URL.

## Technical Notes
- OS: Windows 11
- Package type: ESM ("type": "module")
- Native Postgres (not Docker) for dev
- CSS file (`apps/web/src/styles/app.css`) has mixed line endings — use PowerShell for edits
- `user_settings` table: per-user key/value (keys: 'feedgen', 'preferences')
- No separate `feedgen_settings` table — publishing config is in `user_settings` key='feedgen'
- `user_preferences` table exists but is UNUSED — preferences now stored in `user_settings` key='preferences'
- API responses have `Cache-Control: no-store` to prevent Cloudflare caching
- `index.html` served with `no-cache, no-store, must-revalidate`

## What Was Done This Session

### 1. NSFW Media Blur ✓
- `user_settings` key='preferences' stores `{ blurNsfw: boolean }`
- API: GET/PUT `/api/user/preferences`
- Settings → User tab (first in nav) with "Blur NSFW media" toggle
- Detection: `labelVals` field added to `PoolMatchSample` from `allLabelVals` in pool
- Labels checked: `porn`, `sexual`, `nudity`, `graphic-media` (only these, not all labels)
- UI: `.nsfw-blur` class on media grid, click-to-reveal, "Hide" button to re-blur
- Context: `NsfwBlurProvider` in `main.tsx`, `useNsfwBlur()` hook, `isNsfwPost()` helper

### 2. Visual Editor Undo/Redo Cleanup ✓
- Removed redundant undo/redo buttons from top toolbar (next to Revert to live)
- Canvas toolbar buttons (next to "Panels") remain as the single set

### 3. Update Live Button in Visual Editor ✓
- Added "Update Live" button to visual editor toolbar
- Uses local `updatingLive` state + ref for reliable reset
- Calls same `api.updateFeed` as the actions panel
- Shows "Updating…" while in progress

### 4. Background Feed Rebuild ✓
- `reevalPoolForFeeds` now has `startBackgroundReeval` variant
- `/api/feeds/:id/update` returns immediately after saving rules
- Rebuild runs in background with progress tracking
- `GET /api/feeds/:id/rebuild-status` returns `{ active, processed, total, matched }`
- `FeedRebuildProgress` component polls every 2s, shows progress bar
- Notifications: "Live rules updated — rebuilding candidates…" then "Rebuild complete — X posts match"
- Optimized: batch `getProjectIdsForPostsBatch` instead of per-post queries, batch size 500

### 5. Draft Sensitivity Fix ✓
- Removed `visualLayout` from `feedRulesFingerprint()` in `core-types/feed-lifecycle.ts`
- Moving nodes / opening editor no longer triggers "Draft changes" badge
- Draft still saves positions (autosave unchanged), just doesn't count as a rule change

### 6. Update Live Button State Fix ✓
- Both visual editor and actions panel buttons use `.then(resolve, reject)` pattern with refs
- No more stuck "Updating…" state — buttons reset reliably after API responds
- FeedActionsBar has local `localBusy` state independent of parent `feedBusy` prop

### 7. OAuth Login Enabled ✓
- Frontend OAuth section enabled when `authStatus.oauthConfigured === true`
- `resolveOAuthPublicUrl` now checks `user_settings` key='feedgen' for the master's URL
- Handle input + "Continue with Bluesky" button → redirects to Bluesky OAuth
- Backend was already fully implemented (client metadata, callback, session stores)

### 8. Publishing URL Fallback ✓
- `resolveUserFeedgenSettings` falls back to master's `publicBaseUrl` when user has none
- Non-master users inherit `feedbuilder.fema.monster` automatically
- Feeds always publish under the logged-in user's DID

### 9. User Settings Consolidation ✓
- `user_preferences` table created but then code switched to `user_settings` key='preferences'
- All per-user data in one table with different keys (feedgen, preferences)
- Prevents fragmentation across multiple tables

### 10. Cache Busting ✓
- API responses: `Cache-Control: no-store` on `/api/*` and `/xrpc/*`
- HTML files: `Cache-Control: no-cache, no-store, must-revalidate`
- Hashed assets: `public, max-age=31536000, immutable` (correct, filename changes on rebuild)

### 11. Dev/Prod Script Separation ✓
- `dev-restart.bat` — quick restart both ports (no rebuild)
- `dev-rebuild.bat` — full rebuild + restart both ports
- `dev-api-rebuild.bat` — rebuild API packages + restart port 3000 only
- `dev-stop.bat` — kill both ports

## TODO Next Session

### 1. Post Purge & Global Prefilter System (see `docs/PURGE_SYSTEM.md`)
- **Global Prefilter**: deployment-wide filter that runs BEFORE project L1 rules. Rejects posts at the door (spam, bots, unwanted languages, NSFW on SFW deployments). Same rule types as project prefilters. Master-only.
- **Global Purge**: hard ceiling on post age + conditional purge (engagement thresholds). Overrides project preferences.
- **Per-project purge policies**: optional earlier purging with conditions. Multi-project protection: post only purged when ALL projects agree (or global overrides).
- Cascade delete: `ingested_posts` → `feed_candidates` + `ingested_post_projects`
- Background sweep runner (periodic, configurable interval)
- Dry-run mode
- Settings UI (global in Settings, per-project in project settings)

### 2. Post Text Truncation in Visual Editor Matches Panel
- CSS fix applied but text may still appear truncated
- Investigate `.l2-inspector-panel` overflow chain

### 3. Rename Rankers → Personalization in UI
- Marketplace browse tab labels
- Feed workspace tabs
- Component labels/copy

## Key Files Reference
| File | Purpose |
|------|---------|
| `packages/core-types/src/feed-lifecycle.ts` | `draftsDiffer`, `feedRulesFingerprint` |
| `packages/l2-worker/src/reeval.ts` | `startBackgroundReeval`, `getRebuildStatus`, `reevalPoolForFeeds` |
| `packages/l2-worker/src/pool-match-sample.ts` | `PoolMatchSample` with `labelVals` |
| `packages/storage-postgres/src/user-feedgen-settings.ts` | Publishing URL resolution + master fallback |
| `packages/storage-postgres/src/user-preferences.ts` | `getUserPreferences`/`saveUserPreferences` (uses `user_settings` table) |
| `apps/api/src/deployment-url.ts` | `resolveOAuthPublicUrl` — checks `user_settings` for master's URL |
| `apps/api/src/auth/routes.ts` | OAuth login/callback routes |
| `apps/api/src/auth/oauth.ts` | OAuth client setup |
| `apps/api/src/static-serve.ts` | Static file serving with cache headers |
| `apps/api/src/feeds.ts` | Feed update endpoint (background rebuild) |
| `apps/web/src/components/l2/FeedActionsBar.tsx` | "Update Live" button + rebuild progress |
| `apps/web/src/components/l2/FeedRebuildProgress.tsx` | Rebuild progress bar component |
| `apps/web/src/components/l2/visual/L2VisualEditor.tsx` | Visual editor with Update Live button |
| `apps/web/src/components/l2/PoolMatchSampleRow.tsx` | Post card with NSFW blur |
| `apps/web/src/components/SettingsPage.tsx` | User preferences section |
| `apps/web/src/components/LoginScreen.tsx` | OAuth + app password login |
| `apps/web/src/lib/nsfw-blur.tsx` | NSFW blur context provider |
| `apps/web/src/lib/settings-nav.ts` | Settings tab navigation |
| `apps/web/src/components/ProjectWorkspace.tsx` | `handleUpdateLive` for visual editor |
| `docs/PURGE_SYSTEM.md` | Full purge system design doc |
