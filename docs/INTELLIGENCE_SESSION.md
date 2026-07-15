# Feed Intelligence - System Documentation

## Status: Working ✅

All core functionality operational after fixing:
- Backfill idempotency (was additive, now replace-mode)
- Pool post count (was using max signal count, now queries actual DB count)
- Lift calculation (Laplace smoothing for absent signals, focused baseline)
- Already-captured filtering (reads `strictIncludeGate` config format)
- Build scripts (now include `@cfb/feed-intelligence` package)

## Architecture

```
Live ingest:
  every post → maybeSampleFirehose() (1-in-100, in-memory)
  L1 pass   → recordPoolPost() (in-memory, keyed by projectId)
  L2 match  → recordFeedPost() (in-memory, keyed by feed:feedId)
  hourly    → flush() writes to DB (additive upsert)

Backfill (on-demand, ~35s):
  Step 1: Connect to jetstream, sample ALL posts for 30s → firehose_baseline
  Step 2: Scan ingested_posts + feed_candidates → pool_signals
  Step 3: Filter firehose baseline to only signals that exist in pool (focused)
  Mode: REPLACE (delete + insert for today's window — idempotent)

Suggestions (compute.ts):
  totalPoolPosts = actual count from ingested_post_projects or feed_candidates
  poolFreq = signal.count / totalPoolPosts
  firehoseFreq = signal.count / totalSampled (or Laplace: 1/totalSampled if absent)
  lift = poolFreq / smoothedFhFreq
  confidence = log2(poolCount + 1) * lift
  filtered by: minPoolCount, minLift, dismissed, alreadyCaptured
```

## Key Design Decisions

### Idempotent Backfill
- `replacePoolSignals()` — DELETE for project+window, then INSERT
- `replaceFirehoseBaseline()` — DELETE for window, then INSERT
- Live ingest uses additive `flushPoolSignals()` (correct for incremental)

### Focused Baseline
- Only stores firehose counts for signals that also exist in the pool
- Prevents top-K cutoff from dropping common phrases (which would make them appear "unique")
- Common phrases like "the whole" get proper firehose counts → low lift → filtered out

### Lift Display
- Signals found in firehose: show actual lift (e.g. "4.2x lift")
- Signals NOT in firehose: show "unique" (truly distinctive to pool)
- Ranking among "unique" signals: by pool count via confidence formula

### Already-Captured Filtering
- Reads from `strictIncludeGate.includeBranches` (keyword terms + hashtag tags)
- Exact match only (e.g. "bike lane" ≠ "bike lanes")
- Toggle in UI: "Hide already captured" (on by default, off for analytics)

## UI Features

- **Min hits slider** (2–20): controls `minPoolCount` threshold
- **Type filter**: filter by signal type (hashtags, ngrams, domains, etc.)
- **Hide single words toggle**: filters unigrams client-side
- **Hide already captured toggle**: server-side filtering against project config
- **Info modals**: click ⓘ icon next to each section for description
- **Engaged accounts**: show avatar + @handle + display name, clickable → Bluesky profile
- **SVG icons** for each signal type (no emojis)
- **Toggle switches** instead of checkboxes

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/intelligence/suggestions` | Get ranked suggestions (params: feedId, minPoolCount, hideCaptured, type, limit) |
| POST | `/api/projects/:id/intelligence/dismiss` | Dismiss a suggestion |
| POST | `/api/projects/:id/intelligence/undismiss` | Undismiss |
| GET | `/api/settings/intelligence` | Global config + disabled projects |
| PATCH | `/api/settings/intelligence` | Update config |
| POST | `/api/intelligence/flush` | Trigger immediate flush (needs ingest running) |
| POST | `/api/intelligence/backfill` | Sample jetstream + scan pool posts |

## Files

| File | Purpose |
|------|---------|
| `packages/feed-intelligence/src/backfill.ts` | Jetstream sampling + pool scan, idempotent replace |
| `packages/feed-intelligence/src/compute.ts` | Lift/confidence calculation, already-captured set |
| `packages/feed-intelligence/src/storage.ts` | DB operations: flush, replace, load, prune |
| `packages/feed-intelligence/src/extract.ts` | Signal extraction from NormalizedPost |
| `packages/feed-intelligence/src/ngrams.ts` | Tokenization + unigram/bigram/trigram extraction |
| `packages/feed-intelligence/src/counters.ts` | In-memory signal counters |
| `apps/api/src/feed-intelligence.ts` | API routes |
| `apps/web/src/components/FeedIntelligencePanel.tsx` | UI panel |

## Build Scripts

Both `dev-rebuild.bat` and `dev-api-rebuild.bat` now include `@cfb/feed-intelligence` in the build chain. This was the cause of "code changes not taking effect" — the `dist/` was stale.

## Next Steps

- Action buttons on suggestions ("Add to keywords", "Add to scouts", etc.)
- Longer firehose sampling option (or accumulate over time from live ingest)
- Analytics mode: show all signals with counts regardless of lift
