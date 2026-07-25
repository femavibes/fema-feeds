# Feed Sources — Unified Ingress Plan

## Goal

Replace **Scout** and **Substitute** condition nodes with **source nodes** that behave like **START**: ingress-only entry points on the visual canvas. Posts from each source are evaluated through the same L2 node types (keyword, post_kind, language, labels, …) until **END**.

No `skipDiscovery`. No pathway-sibling vote logic on canvas. Routing defines what each post sees.

---

## Mental model

```
START       ──→ [logic…] ──→ END
SCOUT       ──→ [logic…] ──→ END
SUBSTITUTE  ──→ [logic…] ──→ END
feed-X      ──→ [logic…] ──→ END   (existing native sources)
```

- **Sources are outputs only** — nothing wires *into* a source (no `START → KEYWORDS → SUBSTITUTE`).
- Paths may **converge** on shared nodes (e.g. both START and SUBSTITUTE hit the same language/labels group).
- **END** is shared; multiple ingress paths are OR branches derived from canvas wiring (same as today via `resolveFeedMatch` / `canvasEdgesToMatch`).

---

## Source types

| Canvas node | Config location | What it emits |
|-------------|-----------------|---------------|
| **START** | implicit (project pool + L1 prefilter) | Jetstream posts that passed strict L1 |
| **SCOUT** | Sources tab → Scout discovery | Posts fetched when scout engagement threshold met |
| **SUBSTITUTE** | Sources tab → Substitute promotion | Promoted target post (root, parent, quoted, etc.) |
| **feed / project_pool / static_uri** | Sources tab (existing) | Posts pulled from another feed, pool, or URI list |
| **subscribed plugin** | Sources tab (existing) | Posts from custom code sources |

### Scout source config

Reuse existing scout fields:

- Manual scout DIDs / handles
- Auto-derive (`top_pool_authors`, `top_engagers`)
- Threshold (min, max, scale window, curve, exponent)
- Max post age

### Substitute source config

Reuse existing substitute fields:

- **Direction** (all supported today):
  - `reply_to_root`
  - `reply_to_parent`
  - `quote_to_quoted`
  - `quoted_to_quoters`
  - `replied_to_repliers`
- **Threshold** N (votes required)
- **Time window** (hours, 0 = no expiry)

**Vote intake (internal, not on canvas):**

- Prefilter-matched **replies/quotes** enter the pool (L1 widens `post_kind` when substitute is enabled — same as today).
- Votes accumulate per feed + direction toward target URI.
- Replies are **not** feed output from START even when `post_kind: root` is on the START path.
- When threshold met → fetch target if missing → emit **one post** on the SUBSTITUTE source → evaluate wired logic → END.

**Promoted post filtering:** users wire `SUBSTITUTE → hashtag → language → END` if they want stricter checks on promoted posts. No special vote-filter UI needed.

---

## Evaluation pipeline

For each enabled ingress on a feed:

1. Collect posts from that source (pool scan, scout trigger, substitute promotion, pull feed candidates, …).
2. Resolve canvas paths that **start at that source node** (new edge type: `scout-*`, `substitute`, `source-*` → … → END).
3. Run normal L2 eval on each `(post, path)` — same `evaluateFeedL2`, no bypass flags.
4. On match → upsert `feed_candidates` with **`matched_via`** (+ **`substitute_direction`** when applicable).

If the same post matches via multiple sources/paths, prefer the most specific attribution (see **Attribution** below) or keep highest-priority source for stats.

---

## L1 / prefilter (unchanged intent)

- Strict mode compiles L1 from START-path logic (discovery includes only).
- Substitute source enabled → widen L1 `post_kind` on keyword paths so **replies/quotes** can enter pool for voting.
- L2 on START path still blocks replies with `post_kind: root` (or user wiring).

---

## Deprecate

| Remove | Replace with |
|--------|----------------|
| `L2ScoutCondition` node in palette / match tree | Scout source on Sources tab + canvas node |
| `L2SubstituteCondition` node in palette / match tree | Substitute source on Sources tab + canvas node |
| `skipDiscovery` on L2 eval input | Separate canvas paths per source |
| Scout side-channel auto-pass in `l2-eval` | Scout source path eval |
| Project-wide substitute `skipDiscovery` in ingest | Substitute source path eval only |
| Feed-level scout node config merge at project level | Per-feed scout source (optional project defaults later) |

Keep internal modules (`scout-handler`, `substitution` vote DB) — rewire outputs to source eval.

---

## Canvas / graph changes

### Edge origins

Today edges originate from `start`. Extend:

- `start` → … → `end` (pool / START)
- `scout` → … → `end` (single scout source node id, e.g. `scout` or `source-scout`)
- `substitute` → … → `end`
- `source-0`, `source-1`, … → … → `end` (native sources, already partially present)

### Path resolution

Extend `enumeratePathsStartToEnd` / `canvasEdgesToMatch` to enumerate paths from **each ingress node**, not only `start`. Effective match for eval becomes:

```ts
interface FeedIngressPaths {
  pool: L2RuleGroup      // paths from start
  scout?: L2RuleGroup    // paths from scout node
  substitute?: L2RuleGroup
  native: Record<string, L2RuleGroup>  // source-0, …
}
```

Or: one OR root with tagged branches `{ ingress: 'pool' | 'scout' | 'substitute' | 'native', match: L2RuleGroup }` for eval + stats.

### Palette / Sources tab

- Sources tab: toggles + config for Scout, Substitute, native pulls, subscribed plugins.
- Palette: configured sources appear as draggable ingress nodes (scout/substitute get fixed node ids).
- Remove Scout / Substitute from **discovery** condition palette.

---

## Stats & attribution (groundwork now, UI later)

### `feed_candidates` columns (migration 045)

| Column | Type | Purpose |
|--------|------|---------|
| `matched_via` | TEXT | Ingress that produced this candidate |
| `substitute_direction` | TEXT NULL | When `matched_via = 'substitute'`, which direction promoted it |

### `matched_via` values

| Value | Meaning |
|-------|---------|
| `pool` | START / Jetstream path (normal feed logic) |
| `scout` | Scout source path |
| `substitute` | Substitute source path |
| `feed` | Native source: another feed's candidates |
| `project_pool` | Native source: another project's pool |
| `static_uri` | Native source: URI list |
| `subscribed` | Subscribed source plugin |

### Future UI breakdown (informational)

Per feed, show candidate counts:

```
Total on feed: 142
  Pool (START):     118
  Scout:              9
  Substitute:        15
    reply → root:    11
    quote → quoted:   3
    reply → parent:   1
```

Optional later: match pool panel, feed editor sidebar, community stats — **not required for v1 implementation**.

### Aggregation query (stub)

`countFeedCandidatesByMatchVia(pool, feedId)` → `{ pool, scout, substitute, … }` and `countSubstituteByDirection(pool, feedId)` for granular substitute breakdown.

---

## Implementation phases

### Phase 1 — Groundwork (this PR)

- [x] This plan doc
- [x] Core types: `ScoutFeedSource`, `SubstituteFeedSource`, `FeedCandidateMatchVia`, extend `FeedSourcesConfig`
- [x] Migration: `matched_via`, `substitute_direction` on `feed_candidates`
- [x] `upsertFeedCandidate` accepts optional attribution fields
- [x] `processPostForFeeds` accepts `matchedVia` / `substituteDirection` and persists them
- [x] Stats query helpers (counts by source)
- [x] Ingest wires `matchedVia` for scout + substitute promotes (pool default for START path)

### Phase 2 — Source config UI

- [x] Sources tab: Scout + Substitute sections (move off ConditionRow)
- [x] Canvas palette: scout / substitute ingress nodes
- [x] Wire `addSourceNode` pattern for scout/substitute (forward-only edges)
- [x] Inspector: edit scout/substitute when ingress node selected
- [x] Canvas edge validation: allow edges from scout/substitute/source-*
- [x] Lift legacy scout/substitute condition nodes when enabling on Sources tab

### Phase 3 — Ingest / eval rewire

- [x] Multi-origin path resolution from canvas edges
- [x] Scout handler → eval scout paths (reads `sources.scout` + legacy nodes)
- [x] Substitution → promote → eval substitute paths only (no skipDiscovery)
- [x] Wire `resolveSourcePosts` for native sources through same pipeline
- [x] L1 widen when substitute source enabled on feed

### Phase 4 — Cleanup

- [ ] Remove scout/substitute from condition palette and `l2-eval` no-op passes
- [ ] Migrate existing feeds: condition node → source config (one-time or lazy)
- [ ] Update SCOUT_DISCOVERY.md, SUBSTITUTION.md → point here
- [ ] Match pool / preview: show attribution in summary

### Phase 5 — Stats UI

- [ ] Feed editor: source breakdown panel
- [ ] Match pool: "N via scout", "N via substitute (reply→root: …)"

---

## Design decisions (locked)

1. **Hashtag / keyword on substitute path** filters **promoted posts**, not votes. Votes = prefilter-matched replies/quotes.
2. **Sources are ingress-only** — no serial START → SUBSTITUTE chains.
3. **Full L2** for all sources — no skipDiscovery.
4. **Substitute directions** preserved; stats expose direction granularity.
5. **Per-feed** scout/substitute config (not forced project merge).

---

## Open questions (non-blocking)

- Same post matches pool + scout paths: keep one candidate row — which `matched_via` wins? (Proposal: prefer `substitute` > `scout` > `pool` for stats, or last-write — document in Phase 3.)
- Multiple native sources: already `source-0`, `source-1` — same pattern for scout/substitute singletons per feed.
- Re-eval on Update Live: substitute retroactive processing uses substitute source paths, not skipDiscovery.

---

## Related docs

- [SCOUT_DISCOVERY.md](./SCOUT_DISCOVERY.md) — current scout impl (to be superseded)
- [SUBSTITUTION.md](./SUBSTITUTION.md) — current substitute impl (to be superseded)
- [STRICT_INGEST_MODE.md](./STRICT_INGEST_MODE.md) — L1 prefilter + post_kind widen
