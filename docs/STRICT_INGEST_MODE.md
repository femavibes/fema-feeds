# Strict Ingest Mode — Design Doc

## Problem

Home server deployments can't afford to ingest the full Jetstream firehose. The current system defaults to KEEP (accept posts unless explicitly blocked). This leads to bloated pools — 500k posts where only 50k are actually used by feeds.

The goal: **default to DROP unless a feed specifically wants the post.** Pool size ≈ feed candidate count. Minimal wasted writes.

## Architecture

### Prefilter Modes (per-project setting)

| Mode | Default | Behavior |
|------|---------|----------|
| `manual` | KEEP unless blocked | Current system. User builds prefilter in visual editor. Posts enter pool if they pass the gate. |
| `strict` | DROP unless wanted | Auto-derived from feeds. Posts only enter pool if at least one feed's ingest-eligible logic matches. |

### Pipeline (Strict Mode)

```
Jetstream post arrives
  → Global prefilter (deployment-wide exclusions, always runs, both modes)
  → Project evaluation:
      - Manual mode: standard L1 eval (project prefilter visual editor controls everything)
      - Strict mode: ONLY the strict include gate runs (derived from feeds)
        - If ANY feed's ingest-eligible logic matches → KEEP (tag post for project)
        - If NO feed matches → DROP (default)
```

In strict mode, the project prefilter visual editor is **not used**. Excludes live in the
global prefilter (deployment-wide) or in feed L2 graphs (handled at serve time).

### What "Ingest-Eligible" Means

Not all L2 nodes can run at Jetstream time. Only nodes that use data available in the raw post:

**Ingest-eligible (zero cost at Jetstream):**
- Keywords (text substring / Aho-Corasick)
- Regex (compiled, cached)
- Hashtags (array intersection)
- URL patterns (facet links, link card URLs — available in record)
- Language (array includes)
- Post kind (enum check)
- Embed flags (boolean: hasImage, hasVideo, hasLinkCard, hasTextOnly, hasQuote)
- Self-labels (author-applied, available in record)
- Author list membership (preloaded Set)
- Follow ring membership (preloaded Set)

**NOT ingest-eligible (needs enrichment/viewer context):**
- Engagement thresholds (likes, reposts — not known at ingest)
- Labeler labels (resolved asynchronously after ingest)
- Viewer follow graph (per-viewer, not global)
- Author profile fields (follower count, etc.)
- Editor score (assigned after ingest)
- Time-decay / sort formulas

### Compilation: Feeds → Project Include Gate

When a feed is saved/updated (or project mode changes to strict):

1. For each **enabled** feed in the project (disabled feeds don't contribute, published state doesn't matter — unpublished feeds still contribute so you get data while building):
   - Call `resolveFeedMatch(feed)` to get the canonical tree from visual layout/edges
   - Walk the resolved L2 rule graph
   - Extract ingest-eligible INCLUDE nodes + restrictions (language, post_kind, embed flags, self-labels)
   - Skip all EXCLUDE nodes (keyword excludes, hashtag excludes, url excludes — these stay L2-only)
   - Recursively resolve logic block references (same extraction rules apply inside)
   - Build AND-paths through the graph (DNF: each path = conjunction of conditions)

2. Combine all feeds' paths into the project's compiled include gate:
   - OR across all feeds (any feed wanting the post = keep)
   - No merging/simplification across feeds (keep paths independent)
   - Deduplicate identical paths

3. Store the compiled gate on the project config (same `ingestGate` format, stored as `strictIncludeGate`)

### Extraction Rules — What Gets Extracted vs Stays L2

| Extract into ingest gate | Leave for L2 at serve time |
|--------------------------|---------------------------|
| keyword INCLUDES | keyword EXCLUDES |
| hashtag INCLUDES | hashtag EXCLUDES |
| url INCLUDES | url EXCLUDES |
| regex INCLUDES | regex EXCLUDES |
| language (as path restriction) | engagement thresholds |
| post_kind (as path restriction) | viewer context |
| embed flags (as path restriction) | editor score |
| self-labels (as path restriction) | labeler labels (async resolved) |
| author list membership | sort/rank formulas |
| follow ring membership | time-decay |

**Language is special:** It acts as a restriction within a path, not a standalone exclude. `language=en` means "this include path only applies to English posts." It narrows the include, it doesn't independently exclude.

### Graph Flattening into DNF Paths

The L2 graph is a nested tree of groups (ANY/ALL/N-of) containing leaf conditions. Extraction unrolls this into flat DNF paths:

**Rules:**
- `ANY` at any level → each child is a separate OR branch (creates multiple paths)
- `ALL` → AND the children together into one path
- `ANY` nested inside `ALL` → fork into multiple paths (cross product with the ALL's other conditions)
- `ALL` nested inside `ANY` → stays as one combined path within that ANY branch
- `N-of` → kept as-is in the compiled gate (evaluates children, counts passes)

**Example:**

```
Feed graph:
  root (ANY):
    Path 1: author in_list
    Path 2: ALL(
      keyword EXCLUDES ["badword"]     ← skip (L2 only)
      language = en                     ← extract as path restriction
      url EXCLUDES ["porn.com"]         ← skip (L2 only)
      ANY(
        keyword INCLUDES ["rust", "go"]
        hashtag INCLUDES ["programming"]
        ALL(keyword INCLUDES ["news"] AND url INCLUDES ["nytimes.com"])
      )
    )

Extracted include paths for ingest gate:
  Path 1: author in_list
  Path 2: language=en AND keyword("rust" OR "go")
  Path 3: language=en AND hashtag("programming")
  Path 4: language=en AND keyword("news") AND url("nytimes.com")
```

The excludes (badword, porn.com) are NOT part of the ingest gate. Posts matching "rust" + "badword" will enter the pool, but L2 will reject them at serve time, and purge cleans them up if they never land in a feed.

### N-of Groups

N-of nodes are extracted as-is into the compiled gate:

```
n_of(minPass=2, [keyword("rust"), keyword("tutorial"), hashtag("coding")])
```

At ingest: evaluate each child, count passes, check >= minPass.

**Mixed eligible/non-eligible children in n-of:**

```
n_of(minPass=2, [
  keyword("rust"),        ← ingest-eligible
  hashtag("coding"),      ← ingest-eligible
  engagement > 5,         ← NOT eligible
])
```

Safe rule: **optimistic evaluation.** If `ingest_eligible_passes + non_eligible_count >= minPass` → keep (benefit of doubt). Only reject if mathematically impossible to reach minPass even if all non-eligible nodes pass.

In this example: if keyword("rust") passes (1 eligible pass) + 1 non-eligible node = 2 >= minPass(2) → KEEP. We can't know if engagement will pass, so we assume it might.

### Partial Paths (Mixed Eligible/Non-Eligible)

When a path has both ingest-eligible and non-eligible nodes AND'd together:

```
keyword("rust") AND engagement > 5 AND language=en
```

**Extract all ingest-eligible nodes, ignore non-eligible ones:**
→ `keyword("rust") AND language=en`

If the ingest-eligible subset matches → KEEP. The non-eligible conditions (engagement) filter at L2 serve time. This creates some pool waste (posts that pass ingest but fail L2), but:
- Engagement can change over time (post gets more likes → qualifies later)
- Purge with `notInFeed` cleans up posts that never ultimately made it
- Goal is minimal waste, not zero waste

### Logic Block Resolution

When a feed references a logic block (`logic_block_ref` node), strict mode resolves it:

1. Load the logic block's internal graph (its `root` rule group)
2. Apply the same extraction rules recursively (extract includes + restrictions, skip excludes)
3. The logic block's extracted paths become part of the parent feed's paths

If a logic block contains only non-ingest-eligible nodes (pure engagement filter, etc.), it contributes nothing — same as any non-eligible node.

### Recompilation Triggers

The project strict include gate recompiles when:
- A feed is created, updated, or deleted in the project
- A feed is enabled/disabled
- Project mode switches to strict
- A subscribed logic block is updated (lazy — marked stale, recompiled on next config reload cycle, ~60s)
- Config reload interval fires (existing 60s reload catches any missed changes)

**Logic block cascade:** If a popular logic block updates and many feeds auto-update, we don't thundering-herd recompile. Projects are marked "stale" and the next config reload cycle (every 60s) handles all pending recompilations in one batch.

### Evaluation Order (Optimized)

Within the include pass, check cheap things first to short-circuit:

1. **Language** — single array check, eliminates ~70-90% of firehose for most users
2. **Post kind** — enum check
3. **Self-labels** — array check
4. **Embed flags** — boolean checks
5. **Author list / follow ring** — Set.has() (O(1) preloaded)
6. **Hashtags** — array intersection
7. **Keywords** — Aho-Corasick single-pass (all terms from all feeds combined)
8. **URL patterns** — string matching against facet links / link card URL
9. **Regex** — compiled RegExp (most expensive, last)

### Common Prefix Optimization

If 18 of 20 paths require `language=en`, hoist it:
```
IF language != en → skip 18 paths (only evaluate the 2 that don't need English)
IF language == en → evaluate remaining conditions of those 18 paths
```

This is a trie-like optimization on the DNF paths, grouping by shared leading conditions.

## Aho-Corasick for Keywords

**Scope: ingest gate only, not L2 nodes.**

Current: O(terms × text_length) per post — loop through each term, scan text for each.
Proposed: O(text_length) per post — build automaton from ALL keyword terms across all feeds, single scan finds all matches.

Works for:
- Include (any match → path condition satisfied)
- Whole word (check word boundaries at match positions)
- Case insensitive (lowercase automaton + input)
- Partial match (default substring behavior)

Build automaton once on config reload. Rebuild when feeds change.

Per project in strict mode:
- One include automaton (all include keyword terms across feeds, annotated with which path/node they belong to)
- Single scan → get all matched terms → check which paths are satisfied

The user never sees Aho-Corasick. They build keyword nodes normally in the visual editor. The compiler turns them into an automaton behind the scenes for the ingest path.

## Decisions Summary

| Question | Decision |
|----------|----------|
| Partial paths (mixed eligible/non-eligible) | Keep if ingest-eligible subset matches. L2 + purge handle the rest. |
| Empty feeds / new feeds | 0 feeds = nothing ingested. Correct behavior. |
| Feeds with no ingest-eligible nodes | Rely on other feeds in the project. Accept it. |
| Switching manual → strict | Leave existing pool alone. Purge cleans up over time. |
| Aho-Corasick scope | Ingest gate only, not L2 evaluation nodes. |
| Excludes | Stay L2-only. Not extracted into ingest gate. |
| Logic blocks | Resolved recursively, same extraction rules. |
| Disabled feeds | Don't contribute to strict gate. |
| Unpublished feeds | DO contribute (user is building, wants data flowing). |
| N-of with mixed eligible/non-eligible | Optimistic: keep if mathematically possible to reach minPass. |
| Broad feed warnings (e.g. "language=en" only) | Later — not v1. |
| Recompilation on logic block update | Lazy — mark stale, next 60s reload handles it. |
| Graph source for extraction | Use `resolveFeedMatch()` canonical tree (not raw edges). |

## Implementation Plan

### Phase 1: Core strict mode evaluation
1. Add `prefilterMode: 'manual' | 'strict'` to `ProjectL1Config`
2. Add `strictIncludeGate` field (compiled from feeds, separate from manual prefilter gate)
3. Extraction: `extractStrictIncludePaths(feed)` → walks resolved graph, returns DNF paths
4. Logic block resolution during extraction
5. Compilation: combine all feeds' paths, store as project `strictIncludeGate`
6. Evaluation in ingest runner: if strict mode, run exclude (manual) then include (strict gate)
7. URL node: add to ingest-eligible types if not already there

### Phase 2: Aho-Corasick optimization
1. Add `aho-corasick` package (or implement simple version for substring matching)
2. Build per-project keyword automaton on config reload
3. Replace keyword loop evaluation with single-pass automaton in strict gate eval

### Phase 3: Common prefix optimization
1. Analyze compiled paths for shared leading conditions
2. Build evaluation trie (language → post_kind → ...) for short-circuit
3. Benchmark against naive sequential OR evaluation

### Phase 4: UI + feedback
1. Project settings: mode toggle (manual / strict)
2. Pass rate indicator: "Strict mode: accepting X% of jetstream for this project"
3. Warning for feeds with no ingest-eligible nodes
4. "Estimated pool writes/hour" based on current pass rate

## Risks

- **False negatives**: Unlikely with optimistic partial-path matching, but possible if extraction logic has bugs. Mitigation: thorough test cases with real feed graphs.
- **Recompilation cost**: With many feeds + logic blocks, could be slow. Mitigation: lazy recompile on 60s cycle, not synchronous.
- **User confusion**: Two modes. Mitigation: clear defaults (manual for existing, strict recommended for home servers). Mode toggle in project settings with explanation.
- **Pool waste from skipped excludes**: Posts that match includes but would fail excludes enter pool anyway. Mitigation: purge `notInFeed` rule cleans them fast (6-12h).
