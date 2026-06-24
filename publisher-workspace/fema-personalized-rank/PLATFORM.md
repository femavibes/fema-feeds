# Platform support for scoring rankers

See also **`docs/RANKER_DATA.md`** for the full Near You ↔ CFB field mapping.

## Shipped

### `ingested_posts.rank_snapshot` (migration 016)

Computed at ingest via `@cfb/post-normalize` — Near You–compatible `mediaType`, alt text, tag counts, embed flags, labels.

### Enriched `candidatePosts[]`

Full `RankerCandidate` type in `packages/core-types/src/rank-snapshot.ts`:

- Post + engagement + author profile + `rankSnapshot`
- Loaded by `loadRankerCandidates()` for wasm/remote/worker rankers
- Legacy rows backfilled from `summary_json` on read

### Manifest permission

`ranker:enriched_candidates`

## Still needed for Near You parity (non-geo)

| Feature | Enables |
|---------|---------|
| Config UI from `configSchema` | Publisher tuning |

## Shipped viewer personalization

| Feature | Enables |
|---------|---------|
| `viewerDid` + `viewer` on ranker request | Follow boost, served/liked demotion |
| Impression tables + `sendInteractions` | Seen/like/repost write-back |
