# Review & Rating System

## Overview

Marketplace packages (logic blocks, sort packs, injectors, personalization plugins, enrichers) can be rated by logged-in users. Ratings use a 3-question qualitative system that derives a 5-star score.

## Rating Model

### Questions (v1 — universal for all package kinds)

| # | Question | Weight (max points) |
|---|----------|---------------------|
| 1 | "Does this do what it claims?" | 3 |
| 2 | "Easy to set up and use?" | 2 |
| 3 | "Would you recommend it?" | 1 |

### Answer options per question

| Answer | Points |
|--------|--------|
| Yes | max (full weight) |
| Mostly | half weight |
| No | 0 |

### Score calculation

```
maxPoints = sum of all question weights = 6
rawScore = sum of answer points
finalStars = 1.0 + (rawScore / maxPoints) × 4.0
```

Range: [1.0, 5.0] — no package can have 0 stars.

Example: Yes (3) + Mostly (1) + Yes (1) = 5/6 → 1.0 + (5/6 × 4.0) = 4.33 stars

### Variable weighting

The question config supports variable weights. Config structure:

```json
{
  "questions": [
    { "id": "accuracy", "text": "Does this do what it claims?", "weight": 3 },
    { "id": "usability", "text": "Easy to set up and use?", "weight": 2 },
    { "id": "recommend", "text": "Would you recommend it?", "weight": 1 }
  ]
}
```

Config stored in `config/marketplace-rating-questions.json`, synced from global (same pattern as taxonomy). This allows changing questions/weights without code deploys.

## Data Storage

### What we store per rating

```ts
interface PackageRating {
  packageId: string
  raterDid: string          // who rated
  answers: Array<{          // raw answers preserved
    questionId: string
    answer: 'yes' | 'mostly' | 'no'
  }>
  derivedStars: number      // computed 1.0–5.0 at write time
  createdAt: string
  updatedAt: string         // user can update their rating
}
```

**Key decisions:**
- Store raw answers (not just final number) — allows recalculating if weights change
- One rating per user per package (updatable, not per-version)
- `derivedStars` cached at write time for fast aggregation

### Aggregation on listing

`MarketplaceListingMeta` already has:
```ts
ratingAverage?: number  // 0–5
ratingCount?: number
```

These are recomputed whenever a rating is added/updated/removed.

### DB table

```sql
CREATE TABLE package_ratings (
  package_id TEXT NOT NULL,
  rater_did TEXT NOT NULL,
  answers JSONB NOT NULL,
  derived_stars NUMERIC(3,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (package_id, rater_did)
);
```

## Scope & Visibility

### Local vs Global ratings

- Rating is tied to the **package ID**
- If a package is local-only → ratings are local
- If a package is global → ratings are visible globally
- If a local package gets published to global → **existing ratings automatically become global** (no re-rating needed)
- The registry aggregates all ratings from all deployments for global packages

### Sync behavior

- Consumer deployments push their ratings to the global registry (same pattern as community feed sync)
- Registry aggregates and serves `ratingAverage` / `ratingCount` on catalog responses
- Consumer deployments see global aggregate on global packages

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/marketplace/ratings/:packageId` | Public | Get aggregate + user's own rating |
| POST | `/api/marketplace/ratings/:packageId` | Auth | Submit/update rating (answers array) |
| DELETE | `/api/marketplace/ratings/:packageId` | Auth | Remove user's rating |
| GET | `/api/marketplace/ratings/:packageId/breakdown` | Public | Per-question breakdown (% yes/mostly/no) |

## UI

### Catalog cards (compact)
- Star display + count (already exists via `MarketplaceListingRating` component)
- No interaction on cards — just display

### Detail panel (sidebar)
- Star display (derived average)
- Per-question breakdown bars (e.g., "95% say it does what it claims")
- "Rate this package" button → opens inline rating form
- Rating form: 3 questions, each with Yes/Mostly/No toggle buttons
- If user already rated: show their answers, allow update

### Community feed detail
- Not in v1 — marketplace packages only
- Could extend later with same system

## Question Config Sync

Same pattern as taxonomy:
- `config/marketplace-rating-questions.json` on disk
- Defaults hardcoded in API code (merged on load if file missing)
- `GET /api/marketplace/rating-questions` — public endpoint
- Consumer deployments sync from global on startup + periodic timer
- Admin panel could allow editing (future — not in v1)

## Future Considerations

### Text reviews (v2)
- Add optional `reviewText?: string` to `PackageRating`
- Requires moderation (flag/hide system)
- Display below breakdown in detail panel

### Per-kind questions (v2+)
- Different questions for logic blocks vs injectors vs sort packs
- Old ratings treated as legacy — preserve their `derivedStars` value
- When user re-rates under new question set, their review updates to new format
- Star output always 1.0–5.0 regardless of question count/weights — ensures compatibility

### Question count changes
- System supports any number of questions (not hardcoded to 3)
- Adding a 4th question: old reviews keep their `derivedStars`, new reviews use new formula
- Both produce 1.0–5.0 range — display is always compatible

## Implementation Order

1. DB migration for `package_ratings` table
2. API endpoints (CRUD + aggregate)
3. Rating questions config file + endpoint
4. Frontend: rating form in detail panel
5. Frontend: breakdown display
6. Aggregate recomputation on rating change
7. Global sync (push ratings to registry)
8. Periodic re-aggregate from global

## Files to create/modify

### New files
- `config/marketplace-rating-questions.json` — default questions
- `apps/api/src/marketplace-ratings.ts` — API routes + logic
- `packages/storage-postgres/src/migrations/0XX_package_ratings.sql` — DB table
- `packages/storage-postgres/src/package-ratings.ts` — storage module
- `apps/web/src/components/marketplace/MarketplaceRatingForm.tsx` — rating UI
- `apps/web/src/components/marketplace/MarketplaceRatingBreakdown.tsx` — breakdown bars

### Modified files
- `packages/core-types/src/marketplace-listing.ts` — add rating types
- `apps/api/src/app.ts` — register rating routes
- `apps/web/src/api/client.ts` — add rating API methods
- `apps/web/src/components/marketplace/MarketplaceProductSidebar.tsx` — add rating section
- `apps/web/src/styles/app.css` — rating form + breakdown styles
