# Scout Discovery System

## Problem

Feeds need to discover relevant content beyond what Jetstream delivers directly. Substitution handles reply→root promotion, but there's no mechanism to find entirely new posts that the community would find relevant.

## Solution

**Scouts** are accounts whose engagement signals (likes, reposts, replies) indicate content relevance for a feed. When multiple distinct scouts interact with the same post within a time window, that post is fetched and evaluated through the normal L1+L2 pipeline.

## How It Works

1. A feed/project defines a set of **scout DIDs** (manual or auto-derived)
2. The engagement Jetstream stream already delivers like/repost events with actor DIDs
3. When a scout interacts with a post NOT already in the pool, a signal is recorded
4. Signals accumulate per target URI in a co-occurrence counter
5. When the threshold is met (scaling formula), the post is fetched and run through eval

## Scout Sources

| Source | Description |
|--------|-------------|
| `manual` | Explicitly configured DIDs |
| `top_pool_authors` | Authors with the most posts in the project pool |
| `top_engagers` | Accounts that most frequently like/repost pool posts |

Auto-derived scouts are refreshed on a cadence (e.g. every 6 hours).

## Co-Occurrence Counter

In-memory map: `Map<targetUri, SignalAccumulator>`

```ts
interface SignalAccumulator {
  /** Distinct scout DIDs that interacted */
  scouts: Map<scoutDid, InteractionType>
  /** Timestamp of first signal (clock starts here) */
  firstSignalAt: number
  /** Timestamp of most recent signal */
  lastSignalAt: number
}
```

**Diversity requirement**: Each scout counts once regardless of how many times they interact. A scout who likes AND reposts the same post = 1 distinct signal (though interaction type is tracked for tiebreaking).

## Scaling Threshold Formula

The required number of distinct scouts scales from `min` to `max` based on elapsed time since the first signal.

### Linear

```
elapsed = now - firstSignalAt
progress = clamp(elapsed / scaleWindowMs, 0, 1)
required = min + (max - min) * progress
```

### Curved (rewards early bursts)

```
progress = clamp(elapsed / scaleWindowMs, 0, 1) ^ exponent
required = min + (max - min) * progress
```

Default exponent: 1.5 (slower climb early, faster late).

| Time (60min window) | Linear required | Curved (1.5) required |
|---------------------|-----------------|----------------------|
| 0 min | min (3) | min (3) |
| 15 min | ~4.3 | ~3.6 |
| 30 min | ~5.5 | ~4.3 |
| 45 min | ~6.8 | ~5.6 |
| 60 min+ | max (8) | max (8) |

**Trigger condition**: `distinctScouts >= required` at any point.

## Interaction Weights (Tiebreaking Only)

When multiple posts hit threshold simultaneously, interaction type breaks ties:

| Interaction | Weight |
|-------------|--------|
| like | 1.0 |
| repost | 1.3 |
| reply | 1.2 |

These do NOT affect whether a post triggers — only priority ordering when batch-processing.

## Configuration

Scouts can be configured in two ways:

### 1. Visual Editor (L2 Scout Node)

Drop a **Scout discovery** node onto the feed canvas. The node's inspector configures:
- Manual scout DIDs
- Auto-derive settings
- Threshold (min/max/window/curve)
- Max post age

At L2 eval time, the scout node auto-passes (like substitute). The actual discovery happens via the engagement Jetstream stream.

Multiple feeds in the same project can each have scout nodes — their scout DIDs are merged into a single set per project.

### 2. Project-Level Config

```ts
interface ScoutDiscoveryConfig {
  enabled: boolean
  scouts?: string[]
  autoDerive?: {
    source: 'top_pool_authors' | 'top_engagers'
    count: number
    refreshIntervalMinutes?: number  // default 360 (6h)
  }
  threshold: {
    min: number
    max: number
    scaleWindowMinutes: number
    curve: 'linear' | 'curved'
    exponent?: number     // for curved, default 1.5
  }
  maxPostAgeHours?: number  // default 48
  maxPendingSignals?: number  // default 10000
}
```

Project-level config and feed-level scout nodes are merged: all scout DIDs are unioned, and the first threshold found is used if the project doesn't define one.

## Integration Points

### Engagement Jetstream (existing)

The `EngagementEvent` interface gains an `actorDid` field. The scout system hooks into the same stream — when `actorDid ∈ scoutSet` and `subjectUri ∉ pool`, record a signal.

### Trigger → Eval Pipeline

When threshold is met:
1. Fetch post via `app.bsky.feed.getPostThread` (same as substitution)
2. Normalize via `@cfb/post-normalize`
3. Persist to pool via `persistL1Matches`
4. Run L2 eval on all enabled feeds for the project (normal eval, NOT skipDiscovery — scouts don't prove topical relevance the way substitution does)

**Key difference from substitution**: scout-discovered posts run FULL L2 eval (discovery + gates). They're candidates, not pre-validated.

### Memory Management

- Signals are evicted when `maxPostAgeHours` is exceeded (periodic sweep)
- `maxPendingSignals` caps the map size (LRU eviction of oldest-first-signal entries)
- On runner restart, counter resets (acceptable — signals are ephemeral)

## Follow Ring Discover Mode

Separate from scouts but related: the follow ring gains `role: 'filter' | 'discover'`.

- `role: 'filter'` (default) — existing behavior, gates incoming posts to only those authored by ring members
- `role: 'discover'` — periodically pulls recent posts from ring members (the hub's followers/follows/both) via `getAuthorFeed` API, runs them through L1+L2
- Only valid for `hubSource: 'account'` (viewer mode stays filter-only)
- Polling interval: 30 minutes (configurable)
- Per poll: fetches 3 ring members' recent posts (rotates through the full ring)
- New posts are persisted to pool and run through full L2 eval

Example: hub = `community.bsky.social`, direction = `followers`
- Filter mode: only posts from accounts that follow `community.bsky.social` pass
- Discover mode: actively fetch recent posts from accounts that follow `community.bsky.social` and evaluate them

This is a simpler discovery mechanism: "show me what these community members posted" vs scouts' "show me what the community is engaging with."

## Future Extensions

- **Scout tiers**: weight scouts differently based on their historical hit rate
- **Cross-project scouts**: share scout signals across projects with overlapping topics

## Implementation Status

- [x] Core types: `ScoutDiscoveryConfig`, `L2ScoutCondition`, `ScoutThresholdConfig`
- [x] Follow ring: `role: 'filter' | 'discover'` on `FollowRingFilterConfig` and `L2FollowRingCondition`
- [x] `ScoutSignalCounter` — in-memory co-occurrence counter with linear + curved scaling
- [x] `computeRequiredScouts()` — threshold formula (14 unit tests)
- [x] `EngagementEvent.actorDid` — actor DID flows through from Jetstream
- [x] `createScoutHandler` — merges scouts from project config + feed-level scout nodes
- [x] Handle resolution — DIDs used immediately, handles resolved async via `resolveActorsToDids`
- [x] Auto-derive scouts — `deriveScoutDids` queries top pool authors or top engagers, refreshes every 6h
- [x] Scout stats in `IngestRunnerStatus` — signals, triggers, fetched, evalPass, evalFail, errors
- [x] Scout stats in web UI — "N scout discoveries" in ingest live stats
- [x] Visual editor: Scout discovery node in palette (Scoring category)
- [x] Scout inspector UI: individual account inputs (TermListEditor), min/max threshold, scale window, curve, exponent, max post age
- [x] Follow ring discover mode: `discoverFromRing()` with round-robin rotation through ring members
- [x] Follow ring discover polling job: 30-min interval, 3 authors per ring per cycle
- [x] Follow ring role selector in visual editor (filter/discover dropdown)
- [x] Persistent signals — `scout_signals` table, loaded on startup, upserted on signal, deleted on trigger/sweep
- [x] `engagement_events` table — records actor DIDs on pool post engagement, enables `top_engagers` auto-derive
- [x] Individual scout account inputs (TermListEditor) — replaces textarea in inspector
