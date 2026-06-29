# Marketplace & Plugin Architecture — Status & Direction

## Current State (What's Actually Wired Up)

### 1. Logic Blocks — ✅ FULLY WORKING
**What they do:** Reusable L2 rule groups (include/exclude/score logic) that plug into the feed visual editor as `logic_block_ref` nodes.

**Backend:**
- Stored as JSON (`LogicBlockPackage`) with a `root: L2RuleGroup` + optional `visualLayout`
- At feed evaluation time, `logic_block_ref` nodes in the graph get resolved → their root is inlined
- Used during pool candidate evaluation (`l2-eval`) and also during strict mode extraction (`l1-compile`)
- CRUD: `packages/storage-postgres` → `logic_blocks` + `logic_block_subscriptions` tables
- Version pinning, auto-upgrade detection, subscription model

**Runtime:** Native JSON. No custom code. Runs inside the L2 evaluator.

**Tier:** Native (no verification needed to create/publish)

---

### 2. Sort Packs — ✅ FULLY WORKING
**What they do:** Named sort formulas (`L2Expr`) that set the feed's primary sort key. Applied during pool → candidate evaluation (determines ordering).

**Backend:**
- Stored as JSON (`SortPackPackage`) with a `sortKey: L2Expr`
- Referenced via `FeedRankConfig.packRef` on the feed config
- At candidate evaluation time, the pack's `sortKey` expression is resolved and used as the feed's sort formula
- CRUD: `packages/storage-postgres` → `sort_packs` + `sort_pack_subscriptions` tables

**Runtime:** Native JSON expression tree. No custom code.

**Tier:** Native (no verification needed)

---

### 3. Personalization (formerly "Rankers") — ✅ FULLY WORKING
**What they do:** Reorder skeleton pages at serve time (after DB sort, before injectors). Runs on every `getFeedSkeleton` request.

**Backend:**
- Referenced via `FeedRankConfig.rankerRef` on feed config
- `packages/feedgen/src/rank.ts` → `applyFeedRanker()` loads the plugin package, loads enriched candidate data + viewer context, executes the plugin
- `packages/feed-rank/` → `applyRankerToSkeleton()` handles WASM/remote/native dispatch
- Receives: candidate URIs, enriched post data, viewer DID, follow graph, impression history
- Returns: reordered URI list

**Runtime:** WASM, remote HTTP, worker, or native adapter. **Custom code tier.**

**Tier:** Custom code (publisher verification required)

---

### 4. Injectors — ✅ FULLY WORKING
**What they do:** Insert additional posts into skeleton pages after ranking. Runs after personalization on every `getFeedSkeleton` request.

**Backend:**
- Referenced via `FeedConfig.injector` (`FeedInjectorConfig`)
- `packages/feedgen/src/inject.ts` → `applyFeedInjector()` loads plugin, executes
- `packages/feed-inject/` → `applyInjectorToSkeleton()` handles WASM/remote/native dispatch
- Slot rules enforce spacing: `every` (min gap between injects) + `maxPerPage`
- Receives: organic (post-rank) URIs, slot config, feed config
- Returns: augmented URI list with injected posts

**Runtime:** WASM, remote HTTP, worker, or native adapter. **Custom code tier.**

**Tier:** Custom code (publisher verification required)

---

## The Pipeline (where each type runs)

```
Post arrives on Jetstream
  → L1 prefilter (project level)
  → Pool (ingested_posts)
  → L2 evaluation (LOGIC BLOCKS resolve here, SORT PACKS resolve here)
  → feed_candidates table (sorted by sortKey)
  
getFeedSkeleton request:
  → Load candidates from DB (already sorted by sort formula)
  → Viewer follow-ring filter (optional)
  → PERSONALIZATION plugin (reorder page)
  → INJECTOR plugin (insert extra posts)
  → Return skeleton
```

---

## Naming Discussion

### Option A: Everything is a "Plugin"
Call all 4 types "plugins" with sub-kinds:
- Plugin: Logic Block
- Plugin: Sort Pack  
- Plugin: Personalization
- Plugin: Injector

**Pros:** Simple, consistent. One mental model.
**Cons:** Logic blocks and sort packs are just JSON configs — calling them "plugins" implies custom code. Users might be intimidated.

### Option B: Keep the split (current)
- **Native packages:** Logic Blocks, Sort Packs (JSON, no code, anyone can create)
- **Custom code plugins:** Personalization, Injectors (WASM/remote, verification required)

**Pros:** Clear trust boundary. "Plugin" = runs code, "package" = just data/config.
**Cons:** Two mental models. Marketplace UI has to explain both.

### Option C: "Extensions" umbrella
Call everything an "extension" with tiers:
- Extension: Logic Block (native)
- Extension: Sort Pack (native)
- Extension: Personalization (custom code)
- Extension: Injector (custom code)

**Pros:** Neutral term. Doesn't imply code for native types.
**Cons:** "Extension" is generic and overused.

### Option D: "Packages" umbrella (my recommendation)
Everything in the marketplace is a "package." The UI already uses `LogicBlockPackage`, `SortPackPackage`, `PluginPackage` internally. Unify the user-facing term:

- Package: Logic Block
- Package: Sort Pack
- Package: Personalization  
- Package: Injector

The marketplace browse tabs are the 4 categories. Each has a tier badge: "Native" or "Custom Code."

**Pros:** Already the internal term. Clean. Package = thing you subscribe to.
**Cons:** Less flashy than "plugin."

---

## What's NOT wired up yet (future considerations)

1. **Native personalization/injectors** — The type system allows `runtime: 'native'` for plugins, and there's a "pinned URIs" native adapter for the ranker. But there's no built-in native injector adapter yet (e.g., "pin these posts at position 1, 5, 10").

2. **Logic block custom code** — Currently logic blocks are pure JSON rule groups. Could we allow WASM logic blocks that evaluate custom predicates? This would be a significant expansion.

3. **Sort pack custom code** — Sort packs are native `L2Expr` trees. Custom sort formulas via WASM would need a different evaluation model.

4. **Version history UI** — Partially built (PackageVersionHistory component exists). Could show diffs.

5. **Auto-upgrade policies** — Types exist (`pinned`, `notify`, `auto_minor`). Notify + auto_minor not fully wired in the background.

---

## Recommendation

Keep the 4 categories as they are. They map cleanly to pipeline stages. The "native vs custom code" tier distinction is a trust boundary, not a product distinction.

For user-facing naming, I'd suggest **"packages"** as the umbrella and keep the 4 category names as sub-types. The marketplace is a "package marketplace" where you browse/subscribe to packages across 4 categories.

The tab labels in the marketplace sidebar would be:
- Logic Blocks
- Sort Packs
- Personalization
- Injectors

And the overall section is "Packages" or "Marketplace" (current).
