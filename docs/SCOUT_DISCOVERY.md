# Scout Discovery System

## Problem

Feeds need content beyond what Jetstream and L1 filters deliver directly. Substitution promotes related posts from reply/quote chains; scout discovery finds **entirely new posts** that trusted accounts engage with elsewhere on the network.

## Solution

**Scout** is a feed **source ingress** (Sources tab + canvas):

```
SCOUT → [logic…] → FEED
```

**Scouts** are accounts whose likes and reposts signal relevance. When enough **distinct scouts** interact with the same **external** post within a scaling time window, that post is fetched and evaluated on the **SCOUT path only**.

There is **no `skipDiscovery`**. Scout co-engagement decides *which* post to fetch; canvas wiring decides *whether* it lands on the feed (same model as START and SUBSTITUTE).

---

## How it works

1. Configure scouts on the **Sources** tab (+ Scout): manual accounts, auto-derive, and/or both.
2. Ingest listens to the **engagement Jetstream** (likes + reposts).
3. When `actorDid` is in the scout set and interacts with `subjectUri`, a signal is recorded (if not already triggered).
4. Signals accumulate per target URI (distinct scouts only).
5. When the scaling threshold is met → fetch post → persist to pool → eval SCOUT path → maybe `feed_candidates` with `matched_via = 'scout'`.

Scout watches **what scouts engage with**, not everything scouts post.

---

## Scout selection

### Manual accounts and Bluesky lists

Add DIDs or handles on the Sources tab, and/or attach a **Bluesky list** (curation list, mod list, or starter pack). List members are synced via the same `author_list_cache` / list poll worker as the author node — stored on `feed.authorLists`, referenced by `sources.scout.listId`.

Manual accounts, list members, and auto-derived scouts are **unioned** into the project scout set at ingest.

### Auto-derive (from project pool)

Refreshed about every **6 hours**:

| Source | Meaning |
|--------|---------|
| `top_pool_authors` | Authors with the **most posts in the project pool** |
| `top_engagers` | Accounts who **most often like/repost posts already in the pool** |

`top_engagers` is **not** engagement on the scout’s own posts. It measures **their** likes/reposts **on pool content** (from `engagement_events`). Falls back to `top_pool_authors` if engagement tracking is unavailable.

Auto-derived DIDs are **unioned** with manual scouts.

### Per-feed config

Scout config lives on each feed’s `sources.scout`. Enabled feeds contribute scouts and threshold settings to the project’s ingest handler (merged scout set, first threshold wins when not set at project level).

---

## Co-occurrence counter

In-memory map: `Map<targetUri, SignalEntry>`

```ts
interface SignalEntry {
  scouts: Map<scoutDid, InteractionType>  // distinct scouts
  firstSignalAt: number
  lastSignalAt: number
}
```

- Each scout counts **once** per target (like + repost = 1 scout).
- Interaction weights (like 1.0, repost 1.3) are for **tiebreaking only**, not threshold math.
- Replies are defined in types but **not** wired from the engagement stream today (likes + reposts only).

Signals persist in `scout_signals` (loaded on startup, deleted on trigger/sweep).

---

## Scaling threshold

Required distinct scouts scales from `min` to `max` over `scaleWindowMinutes`:

**Linear:** `required = min + (max - min) * clamp(elapsed / window, 0, 1)`

**Curved:** progress is raised to `exponent` (default 1.5) before scaling — rewards early bursts.

**Trigger:** `distinctScouts >= required`

Also configurable: `maxPostAgeHours` (sweep stale signals), `maxPendingSignals` (memory cap).

---

## Trigger → eval pipeline

When threshold is met:

1. If post **already in pool** → **stop** (no scout-path eval, no re-run for existing pool rows).
2. Fetch via `app.bsky.feed.getPostThread`
3. Normalize → `persistL1Matches`
4. `processPostForFeeds(..., { ingress: 'scout' })`
5. On match → `feed_candidates` with `matched_via = 'scout'`

### Pre-existing pool posts

Scout is **forward-looking**, not a pool scanner:

| Scenario | Behavior |
|----------|----------|
| Post **not** in pool; scouts hit threshold | Fetch + SCOUT path eval |
| Post **already** in pool when threshold fires | Trigger skipped — **no** scout ingress eval |
| Scouts engage with a pool post | Signals may accumulate, but promotion is a no-op at trigger time |
| Enable scout on a feed with existing pool | **No** retroactive scout pass (unlike substitute reeval) |

To get pool posts onto the feed via scout logic, they would need to enter through START, substitute, native sources, or a manual reeval on the appropriate ingress — scout only fires on **new** fetches from engagement signals.

---

## Config shape

```ts
interface ScoutFeedSource {
  type: 'scout'
  enabled?: boolean
  scouts?: string[]           // manual DIDs/handles
  autoDerive?: {
    source: 'top_pool_authors' | 'top_engagers'
    count: number
  }
  threshold: {
    min: number
    max: number
    scaleWindowMinutes: number
    curve: 'linear' | 'curved'
    exponent?: number
  }
  maxPostAgeHours?: number
}
```

Legacy **Scout condition nodes** in the match tree are deprecated. Legacy project-level `scoutDiscovery` may still merge into ingest until fully removed.

---

## Canvas

1. **Sources** → + Scout → configure scouts + threshold
2. **Canvas** → drag **SCOUT** ingress → wire keyword / language / labels / … → **FEED**

Posts co-engaged by scouts only appear if they pass the SCOUT path you wired.

---

## Follow ring discover mode (related, separate)

Follow ring `role: 'discover'` pulls recent posts **authored by** ring members via `getAuthorFeed` polling — “what they post” vs scout’s “what they engage with.”

Not a scout ingress; documented here because both extend discovery beyond Jetstream L1.

---

## Stats

Ingest runner exposes scout stats: signals, triggers, fetched, evalPass, evalFail, errors.

Candidate rows: `matched_via = 'scout'`.

---

## Implementation status

- [x] `ScoutSignalCounter`, scaling threshold, persistence (`scout_signals`)
- [x] `createScoutHandler` — engagement Jetstream hook, per-project counters
- [x] Auto-derive (`deriveScoutDids`, `engagement_events` for top engagers)
- [x] Feed source ingress (`sources.scout`) + canvas SCOUT node
- [x] Bluesky list support (`listId` + `feed.authorLists`, same as author node)
- [x] `processPostForFeeds` with `ingress: 'scout'` and `matched_via` attribution
- [x] Legacy scout condition nodes deprecated
- [ ] Match pool UI: “N via scout” breakdown

---

## Related docs

- [FEED_SOURCES_PLAN.md](./FEED_SOURCES_PLAN.md) — unified ingress model
- [SUBSTITUTION.md](./SUBSTITUTION.md) — substitute promotion (complementary)
