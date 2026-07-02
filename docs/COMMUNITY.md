# Community Section

## Overview

The Community section lets users discover feeds, templates, and other users on their deployment and the global network (`marketplace.fema.monster`).

Community is separate from Marketplace:
- **Community** = discovering feeds, templates, users
- **Marketplace** = packages (logic blocks, sort packs, injectors, personalization plugins, enrichers, sources)

## Current State (Done)

### Backend
- `GET /api/community/feeds?scope=all|deployment|global` — returns public feeds, merges local + global
- `GET /api/community/feed-inputs` — user's subscribed feed inputs
- `POST /api/community/feed-inputs` — subscribe to a feed as input
- `DELETE /api/community/feed-inputs/:feedId` — unsubscribe
- `global-community-registry.ts` — global registry routes (served by `marketplace.fema.monster`)
  - `GET /api/global-community/feeds` — public read API for global feeds
  - `POST /api/global-community/feeds/sync` — consumer deployments sync their public feeds here
  - `syncLocalFeedsToGlobalRegistry()` — fire-and-forget push on every community page load
  - `resolveCommunityFeeds()` — merges local + remote, marks dual-source feeds with `sources[]`
- `/api/global-community/` added to `PUBLIC_API_PREFIXES` (no auth required for server-to-server sync)
- Registry host reads from `community_feeds_global` DB table (not disk)
- Consumer deployments auto-sync public feeds to registry on community page load
- Migration 035: `feed_input_subscriptions` table
- Migration 036: `community_feeds_global` table (registry host only)

### Frontend — Layout
- **Left sidebar nav** (`CommunityNav.tsx`) — Feeds / Templates / Users, uses `sidebar workspace-nav` classes (matches Marketplace/Collection background)
- **Main content** — card grid with scope toggle (All/Global/Deployment)
- **Right detail panel** (`CommunityFeedDetail.tsx`) — standard `sidebar sidebar-right marketplace-sidebar` wrapper, same structure as Marketplace/Collection (sidebar-head + marketplace-sidebar-body sidebar-scroll)
- Uses `project-workspace--catalog` grid layout (same as Marketplace/Collection)
- **Expandable sidebar** — "View more" bar at bottom expands detail panel to span full center area (also on Marketplace + Collection)
- Community tab visible on both consumer and registry (`marketplace.fema.monster`) deployments

### Frontend — Components
- `CommunityWorkspace.tsx` — shell: nav + main + detail panel + expand state
- `community/CommunityNav.tsx` — left sidebar nav with `sidebar` class for background
- `community/CommunityFeedsPanel.tsx` — scope toggle, fetches + filters feeds, card grid
- `community/CommunityFeedCard.tsx` — horizontal card: 9rem square accent/image on left, name + owner + description on right. Scope badges use `marketplace-scope-badge` classes (including `is-dual` for both sources)
- `community/CommunityFeedDetail.tsx` — right detail panel: 10rem centered square image, name, scope, description, owner, stats, actions
- `community/CommunityUsersPanel.tsx` — placeholder
- `SidebarExpandBar.tsx` — shared expand/collapse bar (used by Community, Marketplace, Collection)
- Scope toggle reuses `MarketplaceScopeToggle` (globe/server/layers icons)
- Owner display reuses `PublisherProfileLink` from marketplace
- CSS in `styles/modules/community.css` (modular, not in app.css)

### Feed Settings
- `public` (default true) — show on Community
- `allowAsInput` (default false) — others can use as source
- `logicPublic` (default false) — others can view/copy logic
- `isTemplate` (default false) — show in Templates tab instead of Feeds
- `description` field — shown on Community cards
- All rendered as ToggleRow in the feed settings sidebar

### Dual-Source Display
- When scope is "All", feeds that exist both locally and on the global registry show both globe + server icons (`is-dual` badge)
- `sources[]` array on feed entries tracks which registries contain the feed
- Same visual pattern as Marketplace catalog cards

### Global Sync (Working)
- Consumer deployments push public feeds to `marketplace.fema.monster/api/global-community/feeds/sync` on every community page load (fire-and-forget)
- Registry stores in `community_feeds_global` table
- Registry serves feeds via `GET /api/global-community/feeds` (public, no auth)
- Consumer fetches from registry when scope is `all` or `global`
- Hostname fallback (`unknown-deployment`) when no `OAUTH_PUBLIC_URL`/`SITE_HOST` configured
- Logging: `[community-sync]` messages in stderr for debugging

---

## Needs Work

### 1. Feed Images / Avatars (Done)

- `POST /api/feeds/:id/avatar` — multipart upload (PNG/JPEG/WebP, max 1MB)
- `GET /api/feeds/:id/avatar` — serves stored image (public, no auth)
- `DELETE /api/feeds/:id/avatar` — removes avatar
- Stored on disk at `config/feeds/avatars/{feedId}.{ext}`
- Upload UI in Feed → Actions → Settings tab (above Display name)
- Community cards show avatar in the 9rem square area (falls back to accent color + initials)
- Community detail panel shows avatar in the 10rem square
- On Bluesky publish: avatar bytes uploaded as blob and attached to `app.bsky.feed.generator` record
- Auth: avatar GET is public (added to `isPublicApiPath` check)
- Community endpoint includes `avatarUrl` for local feeds that have an avatar file

### 2. Feed Stats

**Problem:** No usage stats exist yet beyond candidate count.

**Stats to track:**
- Daily active users (unique viewers requesting skeleton in last 24h)
- Total subscribers (users who pinned/saved the feed on Bluesky)
- Feed input subscribers (how many other feeds use this as a source)
- Post freshness (age of newest candidate)

**Backend work:**
- Aggregate `viewer_feed_opens` into daily/weekly active viewers
- Count `feed_input_subscriptions` per feed
- Expose via `GET /api/community/feeds` response + `GET /api/feeds/:id/stats`

**Display:**
- Community feed card (compact: subscriber count, post count)
- Community feed detail panel (full stats)
- Feed overview page (owner's view with trends)

### 3. Users Tab

**Problem:** Placeholder only.

**What to do:**
- List users on this deployment (from `users` table)
- Show: avatar, handle, display name, feed count, join date
- Profile page: user's public feeds, activity stats
- Link from feed cards to user profile

### 4. Expanded Sidebar Content

**Problem:** The expandable sidebar currently just shows the same content with more space.

**What to do:**
- Design expanded layout with additional content (full logic tree preview, post samples, activity graph)
- Different layout in expanded mode (e.g., two-column within the expanded area)
- Tune per section (Community shows feed preview, Marketplace shows full readme, Collection shows editor)

### 5. Clone Logic Flow (Done)

**Create Feed Modal** (`CreateFeedModal.tsx`):
- Replaces the old inline "+ Feed" form in the sidebar
- Fields: Feed ID, Name, Description, Avatar upload
- Dynamic settings toggles rendered from config array: Public on Community (default on), Logic public, Allow as input, Template, Stats public
- Clone mode: description prefilled with "Forked from [name]", logic fields pre-loaded
- On submit: creates feed via `POST /api/feeds` with logic included, uploads avatar if provided

**Entry points:**
1. **Sidebar "+ Feed" button** — opens modal in blank mode
2. **Feed overview "Clone feed" button** — opens modal with your own feed's logic pre-filled
3. **Community detail toolbar "Clone Feed" button** — fetches logic via API, opens modal

**Backend:**
- `GET /api/community/feeds/:id/logic` — returns logic fields (match, rank, visualLayout, injector, authorLists, sources, personalization) for feeds with `logicPublic: true`

**Community detail toolbar:**
- "Clone Feed" and "+Inputs" buttons always visible, greyed out when unavailable (`logicPublic` off or `allowAsInput` off)
- Both use `btn-secondary` style
- "View logic" remains as a separate read-only button in the detail body (placeholder for now)

### 6. Search / Filter

**Problem:** No way to search or filter community feeds.

**What to do:**
- Text search on feed name + description
- Filter by tag/category (requires adding tags to FeedConfig)
- Sort options (newest, most subscribers, most posts)

### 7. Periodic Sync

**Problem:** Sync only happens when a user opens the Community page. If no one opens it, feeds don't sync.

**What to do:**
- Add a periodic timer (e.g., every 5 minutes) that syncs public feeds to the registry
- Also trigger sync on feed save when `public` changes to true
- Similar to the DuckDNS periodic sync pattern already in the codebase

---

## Architecture Notes

- Global community registry lives on `marketplace.fema.monster` (same host as marketplace)
- Uses same `isCanonicalGlobalRegistryHost()` / `globalMarketplaceRegistryRole()` pattern
- No approval needed (unlike marketplace) — feeds sync automatically
- Auth: `/api/global-community/` is in `PUBLIC_API_PREFIXES` (server-to-server, no session)
- Registry reads from `community_feeds_global` table; consumers read from remote HTTP
- `deploymentPublicHostname()` determines the host label sent during sync
