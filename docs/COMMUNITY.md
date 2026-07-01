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
- Migration 035: `feed_input_subscriptions` table
- Migration 036: `community_feeds_global` table (registry host only)

### Frontend — Layout
- **Sidebar nav** (`CommunityNav.tsx`) — Feeds / Templates / Users items, same pattern as Marketplace
- **Main content** — card grid with scope toggle (All/Global/Deployment)
- **Detail panel** (`CommunityFeedDetail.tsx`) — right sidebar opens on card click, shows full info + actions
- Uses `project-workspace--catalog` + `l2-main-panel` layout classes (same as Marketplace)

### Frontend — Components
- `CommunityWorkspace.tsx` — shell: nav + main + detail panel
- `community/CommunityNav.tsx` — left sidebar nav
- `community/CommunityFeedsPanel.tsx` — scope toggle, fetches + filters feeds, card grid
- `community/CommunityFeedCard.tsx` — clickable card with accent strip, initials, name, description, owner profile, scope badge
- `community/CommunityFeedDetail.tsx` — right detail panel with full description, owner, stats, actions
- `community/CommunityUsersPanel.tsx` — placeholder
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

### Sources Tab Integration
- `NativeSourcesPanel` "+ Feed" picker shows subscribed inputs + deployment feeds
- Subscribed inputs come from `GET /api/community/feed-inputs`

---

## Needs Work

### 1. ~~Layout: Follow Marketplace Pattern~~ PARTIALLY DONE

Community now uses:
- Left sidebar nav (`CommunityNav`) with Feeds/Templates/Users
- Main content area with card grid
- Right detail panel on card click (`CommunityFeedDetail`)
- Same CSS layout classes as Marketplace (`project-workspace--catalog`, `l2-main-panel`)

**Still needs fixing:**
- The left sidebar (`CommunityNav`) does NOT visually match the marketplace/collection sidebar. It needs to look identical — same spacing, font sizes, active state styling, section headers. Currently it's a bare-bones nav that doesn't match the polished `WorkspaceNav` appearance used by Marketplace and My Collection.

### 2. Feed Images

**Problem:** Feeds don't have image/avatar support yet. Community cards use colored initials as placeholder.

**Fix:**
- Add `avatar?: string` field to `FeedConfig` (base64 or URL to uploaded image)
- Add image upload to feed settings sidebar (same image used when publishing to Bluesky)
- Community card shows the image in the accent strip area when available, falls back to colored initials
- Detail panel shows larger image

### 3. Feed Stats

**Problem:** No usage stats exist yet. Need backend tracking + display.

**Stats to track:**
- Daily active users (unique viewers requesting skeleton in last 24h)
- Total subscribers (users who pinned/saved the feed on Bluesky — requires firehose tracking)
- Feed input subscribers (how many other feeds use this as a source — already in `feed_input_subscriptions`)
- Candidate count (already available)
- Post freshness (age of newest candidate)

**Display locations:**
- Community feed card (compact: subscriber count, post count)
- Community feed detail panel (full stats)
- Feed overview page (owner's view with trends)

**Backend work:**
- Track skeleton requests per feed per viewer DID (already have `viewer_feed_opens`)
- Aggregate daily/weekly active viewers
- Count feed_input_subscriptions per feed
- Expose via `GET /api/community/feeds` response + `GET /api/feeds/:id/stats`

### 3. ~~Feed Owner Display~~ DONE

Cards show `PublisherProfileLink` (resolves DID → avatar + handle via API).
Detail panel shows larger owner profile with link to Bluesky.
Future: link to Community > Users profile page.

### 5. Global Sync

**Problem:** Consumer deployments can fetch from global registry but don't push their feeds there yet.

**Fix:**
- Background job: periodically POST public feeds to `marketplace.fema.monster/api/global-community/feeds/sync`
- Triggered on feed save/publish when `public` is true
- Include deployment hostname so global cards show origin

### 6. Users Tab

**Problem:** Placeholder only.

**Fix:**
- List users on this deployment (from `users` table)
- Show: avatar, handle, display name, feed count, join date
- Profile page: user's public feeds, activity stats
- Link from feed cards to user profile

---

## Next Steps (Priority Order)

1. **Fix community sidebar styling** — Make `CommunityNav` visually match the Marketplace/Collection sidebar (same spacing, fonts, active states, section headers as `WorkspaceNav`).
2. **Feed images** — Add `avatar` to FeedConfig, upload UI in settings, display on cards + Bluesky publish.
3. ~~**Owner display**~~ DONE
4. **Stats backend** — Aggregate viewer_feed_opens into daily active counts. Expose on API.
5. **Stats display** — Show on community cards, detail panel, AND the feed overview page (owner's view with trends).
6. **Global sync job** — Push public feeds to registry on save. Pull on Community page load.
7. **Users tab** — User directory, profile pages, link from feed cards.
8. **Copy logic flow** — "Copy logic" button opens create-feed with that feed's rules pre-loaded.
9. **Search/filter** — Text search on Community feeds, filter by tag/category (future).
