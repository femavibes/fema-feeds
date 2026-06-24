# fema Personalize Rank

Near You–inspired **global scoring ranker** for Custom Feed Builder. Reorders skeleton pages using engagement, freshness, velocity, follower normalization, media/alt-text signals, and author diversity — **without** location or per-viewer personalization (those require data CFB does not expose yet).

Publisher: **fema.monster** (global verified)

## Scoring factors (ported)

| Factor | Source in Near You | CFB data |
|--------|-------------------|----------|
| Freshness decay | `freshness` | `indexedAt` |
| Engagement weights | `engagement` | `post_engagement` |
| Velocity boost | `velocity` | likes / age (batch baseline) |
| Follower normalization | `follower_norm` | `author_profiles.followers_count` |
| Media boost | `media` | embed flags in `summary_json` |
| Alt-text penalty | `alt_text` | embed alt fields |
| Hashtag weight | `hashtag` | `facetTags` count |
| Author diversity | `diversity` post-process | `authorDid` spacing |
| Following boost | `following` | `viewer.followedAuthorDids` |
| Served demotion | `served` | `viewer.servedPosts` |
| Liked/reposted demotion | `liked` | `viewer.likedPostUris` / `repostedPostUris` |

### Requires authenticated viewer

Following boost and impression demotion apply only when CFB passes **`viewer`** on the ranker request (Bluesky JWT on `getFeedSkeleton`).

## Host requirements

CFB must pass **`candidatePosts`** on ranker requests (see [PLATFORM.md](./PLATFORM.md)). Shipped in this repo:

- `RankerCandidate` type in `@cfb/core-types`
- `loadRankerCandidates()` in `@cfb/storage-postgres`
- Enrichment wired in `@cfb/feedgen` → `@cfb/feed-rank`

Manifest permission: `ranker:enriched_candidates`

## Build WASM

```powershell
.\publisher-workspace\fema-personalized-rank\wasm\build.ps1
# Output: publisher-workspace/fema-personalized-rank/dist/personalized-rank.wasm
```

## Test TypeScript engine

```powershell
cd publisher-workspace/fema-personalized-rank
pnpm install
pnpm test
```

The TS engine in `src/` is the reference implementation; the Rust WASM mirrors the same formulas for production upload.

## Publish on fema.monster

1. Global verified account → **Collection → New custom code**
2. Kind: **Ranker**, runtime: **WASM**
3. Name: `Fema personalized rank`, slug: `fema-personalized-rank`
4. Upload `dist/personalized-rank.wasm`
5. **Submit to global**
6. On a feed: **Sorting → Serve-time ranker** → subscribe and apply
7. Optional feed config preset: `{ "preset": "engagement" }` or `"fresh"` / `"balanced"`

## Remote dev server (optional)

For debugging without rebuilding WASM:

```powershell
cd publisher-workspace/fema-personalized-rank
pnpm exec tsx service/server.ts
# POST http://127.0.0.1:8791/on_sort with RankerRequest JSON
```

Create the package with runtime **Remote** and endpoint `https://your-host/on_sort` if you prefer hosting the TS engine directly.

## Reference

- Near You engine: `_ref/therichferro-ATlas-Near-You-Feed/src/scoring/engine.ts`
- CFB plugin guide: Collection → **Plugin developer guide**
