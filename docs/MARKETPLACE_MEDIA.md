# Marketplace Media & Product Pages

## Overview

Marketplace listings (logic blocks, sort packs, plugins) can have storefront media: icon, cover image, gallery screenshots, and YouTube video. These are uploaded as files and served via public API endpoints.

## Current State (Done)

### Backend — Asset Upload/Serve

- `POST /api/marketplace-assets/:packageId/:slot` — multipart upload (PNG/JPEG/WebP, max 2MB)
- `GET /api/marketplace-assets/:packageId/:slot` — serves stored image (public, no auth)
- `DELETE /api/marketplace-assets/:packageId/:slot` — removes asset
- `GET /api/marketplace-assets/:packageId` — lists all asset URLs for a package
- Stored on disk at `config/marketplace-assets/{packageId}/{slot}.{ext}`
- Valid slots: `icon`, `cover`, `gallery-1` through `gallery-8`
- Auth: all GET endpoints are public (in `isPublicApiPath`); POST/DELETE require login

### Type Changes

`MarketplaceListingMeta` (in `core-types/src/marketplace-listing.ts`):
```typescript
interface MarketplaceListingMeta {
  iconUrl?: string
  coverUrl?: string
  productImageUrl?: string
  galleryUrls?: string[]    // up to 8 gallery/screenshot images
  youtubeUrl?: string       // YouTube video URL
  ratingAverage?: number
  ratingCount?: number
}
```

### Storage Layer

`storage-postgres/src/marketplace-listing-meta.ts`:
- `parseListingMeta()` — handles all fields including `galleryUrls` (array, max 8) and `youtubeUrl`
- `normalizePublisherListingMeta()` — passes through gallery and YouTube
- `PublisherListingMetaInput` type includes `galleryUrls` and `youtubeUrl`

### Frontend — Edit Storefront Listing

- `MarketplaceListingFields.tsx` — fully controlled component with `ImageSlot` upload widgets
  - Icon upload (square preview, 3rem)
  - Cover upload (wide preview, 8rem × 3rem)
  - Gallery grid (up to 8 images, 4rem × 3rem previews, "Add image" slot)
  - YouTube URL text input
- `MarketplaceListingEditor.tsx` — wraps fields + description + live preview (card + hero)
- Accessed from Collection sidebar → "Edit storefront listing" button

### Frontend — Display

- `MarketplaceListingHero.tsx` — detail panel hero (cover + icon + description + product image + gallery + YouTube)
- `MarketplaceListingGallery.tsx` — renders gallery grid + YouTube iframe embed
  - YouTube: extracts video ID from watch/youtu.be/shorts/embed URLs, renders responsive 16:9 iframe
  - Gallery: auto-fill grid at 10rem min columns, 16:10 aspect ratio images
  - Only renders when content exists
- `MarketplaceCatalogCard.tsx` — browse card (cover + icon + name + rating + publisher + description)
  - Order: name + trust badge → rating → publisher profile → description → version/meta

### CSS

- `app.css`: `.marketplace-asset-slot`, `.marketplace-asset-gallery`, `.marketplace-listing-gallery` classes
- Gallery video uses `padding-bottom: 56.25%` trick for responsive 16:9 embed
- Gallery images use `aspect-ratio: 16 / 10` with `object-fit: cover`

---

## Needs Work

### 1. Review/Rating System

**Problem:** `ratingAverage` and `ratingCount` exist in the type but are placeholder — no way to actually submit or view reviews.

**What to build:**
- `POST /api/marketplace/reviews` — submit a review (1–5 stars + optional text)
- `GET /api/marketplace/reviews/:packageId` — list reviews for a package
- `DELETE /api/marketplace/reviews/:id` — delete own review
- DB table: `marketplace_reviews` (reviewer_did, package_id, product_kind, rating, text, created_at)
- Aggregate: update `ratingAverage`/`ratingCount` on listing_meta after each review
- Frontend: star rating display, review list, submit form
- Moderation: flag/remove inappropriate reviews (master/verifier)
- One review per user per package (upsert)

### 2. Full Product Page

**Problem:** Currently everything is in the sidebar (collapsed or expanded). A dedicated full-page view would be better for complex listings.

**What a full product page needs:**
- Hero section (cover + icon + name + publisher + trust badge + subscribe button)
- Description (markdown rendered?)
- Gallery carousel or lightbox (click to enlarge)
- YouTube embed (full width)
- Reviews section (star breakdown + individual reviews)
- Version history / changelog
- Related packages (same publisher, same category)
- Install/subscribe CTA (sticky or in hero)
- Usage stats (subscriber count, feed count using this block)

### 3. Categories / Tags

**Problem:** No way to categorize or tag packages for discovery.

**What to build:**
- Add `tags?: string[]` to package types
- Predefined categories (content-filter, engagement, media, language, moderation, etc.)
- Filter by category in marketplace browse
- Category badges on cards

### 4. Search

**Problem:** No text search in marketplace.

**What to build:**
- Full-text search on name + description + tags
- Fuzzy matching
- Sort by relevance, rating, newest, most subscribed

### 5. Publisher Pages

**Problem:** No dedicated publisher profile page in marketplace context.

**What to build:**
- `/marketplace/publisher/:did` — all packages by this publisher
- Publisher bio, verification status, total downloads
- Link from package detail → publisher page

### 6. Changelog / Release Notes

**Problem:** Version history exists but no release notes.

**What to build:**
- Optional `releaseNotes?: string` on each version
- Display in version history section of product page
- Notify subscribers of new versions with notes

---

## Architecture Notes

- Assets stored on disk (not DB) — same pattern as feed avatars
- Docker volume `./config:/app/config` includes `marketplace-assets/` directory
- Public GET endpoints allow cross-deployment display (registry can show consumer assets if URL is reachable)
- Gallery URLs stored in `listing_meta` JSONB column — no separate table needed
- YouTube embed is client-side only (no server-side processing of video)
