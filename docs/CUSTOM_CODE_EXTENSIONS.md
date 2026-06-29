# Custom Code Extensions — Design Document

**Status:** Design phase (not yet implemented)

## Vision

Every marketplace category supports both native (JSON, no-code) and custom code (WASM/remote) packages. Beyond that, a new category — **Enrichers** — runs custom code to augment post data in the database, producing fields that any downstream logic block or sort formula can consume.

The goal: users who can code can extend every aspect of the feed pipeline, and the data they produce benefits the entire ecosystem (other packages can depend on enriched fields).

---

## New Category: Enrichers

### What they do
Enrichers run custom code against posts and write additional metadata back to the database. This enriched data becomes available to all downstream consumers (logic blocks, sort packs, personalization, etc.).

### Examples
- **Video analyzer:** Uses ffmpeg to extract actual resolution (not client-reported), bitrate, codec, duration. Writes `{ actualWidth, actualHeight, bitrate, codec }` to the post's enrichment fields.
- **ML content tagger:** Calls an ML service to classify post content (art, photography, meme, news, etc.). Writes `{ contentTags: ['art', 'photography'], confidence: 0.92 }`.
- **Sentiment scorer:** NLP analysis of post text. Writes `{ sentiment: 0.7, toxicity: 0.1 }`.
- **Language detector:** Better language detection than client-reported `langs[]`. Writes `{ detectedLang: 'ja', confidence: 0.98 }`.
- **Image alt-text generator:** Runs OCR/captioning on images. Writes `{ generatedAlt: '...' }`.

### Where they run
Enrichers run **after ingest, before L2 evaluation**. Two possible trigger modes:

1. **On-ingest (streaming):** Runs on every new post entering the pool. Must be fast or async.
2. **Background sweep:** Periodically scans un-enriched posts and processes them in batches. Better for expensive operations (ffmpeg, ML inference).

### Contract

```typescript
// Enricher input (what the WASM/remote receives)
interface EnricherInput {
  post: NormalizedPost       // full post data
  existingEnrichment?: Record<string, unknown>  // previously written enrichment
  config?: Record<string, unknown>  // per-deployment config
}

// Enricher output (what it writes back)
interface EnricherOutput {
  fields: Record<string, unknown>  // merged into post enrichment
  // Optional: signal that enrichment failed/skipped
  skipped?: boolean
  error?: string
}
```

### Storage
Posts get an `enrichment` JSONB column (or separate `post_enrichments` table keyed by post_uri + enricher_id). Each enricher writes to its own namespace:

```jsonc
{
  "video-analyzer": { "actualWidth": 1080, "actualHeight": 1920, "bitrate": 4500, "codec": "h264" },
  "content-tagger": { "tags": ["art", "digital"], "confidence": 0.91 },
  "sentiment": { "score": 0.7, "toxicity": 0.05 }
}
```

Namespacing by enricher package ID prevents collisions and makes dependency tracking clear.

### Performance considerations
- Enrichers that do I/O (ffmpeg, HTTP to ML service) MUST run async/background, not blocking ingest.
- Enricher results are cached per-post — only runs once per post per enricher version.
- Version bump on enricher → marks existing enrichments as stale → re-processes in background.

---

## Custom Code Logic Blocks

### What they do
Same as native logic blocks (appear as nodes in the visual editor), but instead of a JSON rule tree, they execute custom code to decide match/reject + optional score.

### Contract

```typescript
// Logic block input
interface CustomLogicBlockInput {
  post: NormalizedPost
  metrics: PostMetrics
  enrichment: Record<string, unknown>  // ALL enrichment data for this post
  config?: Record<string, unknown>     // per-node config from visual editor
}

// Logic block output
interface CustomLogicBlockOutput {
  matched: boolean
  score?: number   // optional contribution to sort key
  reason?: string  // optional trace label for debugging
}
```

### Where they run
During L2 candidate evaluation. When the evaluator hits a `logic_block_ref` node whose package has a custom code runtime:

```
L2 evaluator walks the feed graph
  → Hits logic_block_ref node
  → Check package runtime:
     → 'native' (current): inline JSON root, evaluate rule tree
     → 'wasm'/'remote'/'worker': call custom code with post + enrichment → get match result
```

### Visual editor integration
- Custom code logic blocks appear in the node palette alongside native ones
- Drag onto canvas, wire like any other node (include/exclude/score-if-match)
- Config panel shows package-defined config schema (e.g., threshold sliders, tag selectors)
- Badge indicates "Custom Code" tier

### Dependencies on enrichers
A custom logic block can declare enricher dependencies in its manifest:

```jsonc
{
  "id": "hd-video-filter",
  "kind": "logic_block",
  "runtime": "wasm",
  "hooks": ["on_match"],
  "dependencies": {
    "enrichers": ["video-analyzer"]
  },
  "configSchema": {
    "minWidth": { "type": "number", "default": 1920 },
    "minBitrate": { "type": "number", "default": 3000 }
  }
}
```

If the required enricher hasn't run on a post yet, the logic block either:
- Skips the post (configurable: `onMissingEnrichment: 'skip' | 'fail_open' | 'fail_closed'`)
- Or the system ensures enrichers run before L2 eval for posts that need it

### Native logic blocks reading enrichment
Native (JSON) logic blocks should ALSO be able to read enrichment fields. New operand type:

```jsonc
{
  "type": "condition",
  "field": "enrichment.video-analyzer.actualWidth",
  "op": "gte",
  "value": 1920
}
```

This means even non-coders can build filters on enriched data, once an enricher is installed.

---

## Custom Code Sort Packs

### What they do
Same as native sort packs (contribute to the feed's sort key), but compute scores via code with access to enrichment data and more complex logic than native `L2Expr` can express.

### Contract

```typescript
interface CustomSortInput {
  post: NormalizedPost
  metrics: PostMetrics
  enrichment: Record<string, unknown>
  config?: Record<string, unknown>
}

interface CustomSortOutput {
  score: number  // the sort key value (or modifier contribution)
}
```

### Where they run
During L2 candidate evaluation, alongside the native sort formula. NOT at serve time — that's personalization.

### Modifier Stacking

Sort packs don't have to be either/or. A feed can have a base formula plus stacked modifiers:

**Replace** (max 1):
- One sort pack IS the entire formula. Returns the final number.
- Current behavior. Simple "I handle everything" mode.

**Add** (unlimited, stackable):
- Returns a number that gets added to the running score.
- Feed owner sets a `weight` multiplier to dial the effect up/down.
- Order doesn't matter (addition is commutative).
- Example: ML quality scorer returns 82 → adds 82 × weight to score.

**Multiply** (unlimited, stackable):
- Returns a factor applied after all adds.
- A factor of 1.0 = no change, 2.0 = double, 0.5 = halve.
- Useful for conditional boosts: "if HD video, ×1.3"
- All multiply factors are combined (multiplication is commutative).

### Evaluation order

```
1. Compute base score:
   - If "replace" pack exists → pack returns final base
   - Otherwise → native L2Expr formula evaluates
2. For each "add" modifier:
   score += modifier.output × modifier.weight
3. Combine all "multiply" modifiers:
   combinedFactor = multiply_1.output × multiply_2.output × ...
   score *= combinedFactor
4. Final score → stored in feed_candidates.sort_key
```

### Example

```
Feed config:
  Base: native engagement formula → baseScore = 47

  Modifier 1: "ml-quality" (mode: add, weight: 1.0)
    → reads enrichment.ml-quality.score = 82
    → contributes: +82

  Modifier 2: "art-boost" (mode: multiply, weight: 1.0)
    → post tagged 'art' by enricher? factor = 1.5 : factor = 1.0
    → contributes: ×1.5

  Modifier 3: "recency-penalty" (mode: add, weight: 0.5)
    → post is 48hrs old, returns -20
    → contributes: +(-20 × 0.5) = -10

Result:
  47 + 82 + (-10) = 119
  119 × 1.5 = 178.5 ← final sort_key
```

### Feed config shape

```jsonc
{
  "rank": {
    "sortKey": { /* native L2Expr — the base formula */ },
    "packRef": { /* optional: replace pack, overrides sortKey */ },
    "modifiers": [
      {
        "packageId": "ml-quality-scorer",
        "versionPin": "1.2.0",
        "mode": "add",
        "weight": 1.0,
        "config": {}
      },
      {
        "packageId": "hd-video-boost",
        "versionPin": "1.0.0",
        "mode": "multiply",
        "weight": 1.0,
        "config": { "factor": 1.5 }
      }
    ]
  }
}
```

### UI concept (Sorting tab)

```
Sort formula: [Custom formula ▼]  ← base
  [toggles and dials...]

Score modifiers:
  + ML Quality (v1.2.0)     weight: [1.0]  [×] remove
  + Recency Penalty (v1.0)  weight: [0.5]  [×] remove
  × HD Video Boost (v1.0)   factor config  [×] remove

[+ Add modifier from subscriptions]
```

---

## Expanded Native Formula Operators

Currently `L2Expr` only supports `+`, `-`, `*`, `/` with `field` and `literal` nodes. This limits what native sort packs can express. Expanding the expression language makes native packs far more powerful.

### Proposed new expression node types

```typescript
// Current:
type L2Expr =
  | { type: 'field'; field: L2NumericField }
  | { type: 'literal'; value: number }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: L2Expr; right: L2Expr }

// Expanded:
type L2Expr =
  | { type: 'field'; field: L2NumericField }
  | { type: 'literal'; value: number }
  | { type: 'binary'; op: '+' | '-' | '*' | '/' | '**' | 'min' | 'max'; left: L2Expr; right: L2Expr }
  | { type: 'unary'; op: 'log' | 'sqrt' | 'abs' | 'neg' | 'floor' | 'ceil'; operand: L2Expr }
  | { type: 'clamp'; value: L2Expr; min: L2Expr; max: L2Expr }
  | { type: 'cond'; test: L2CondExpr; then: L2Expr; else: L2Expr }
  | { type: 'ratio'; numerator: L2Expr; denominator: L2Expr; guard: number }

// Condition for 'cond' node:
type L2CondExpr =
  | { type: 'compare'; op: '>' | '>=' | '<' | '<=' | '==' | '!='; left: L2Expr; right: L2Expr }
  | { type: 'and'; conditions: L2CondExpr[] }
  | { type: 'or'; conditions: L2CondExpr[] }
```

### What this enables

| Recipe | Expression | Use case |
|--------|-----------|----------|
| Engagement rate | `ratio(likes + reposts, followers + 1)` | Reach-normalized score |
| Log engagement | `log(likes + 1) × 10` | Diminishing returns on viral posts |
| Quality floor | `clamp(score, 10, 10000)` | Prevent negative/extreme scores |
| Conditional boost | `if(has_video, score × 1.5, score)` | Media-type specific |
| Sqrt fairness | `score / sqrt(followers + 1)` | Real sqrt, not approximation |
| Power curve | `likes ** 0.7` | Sub-linear engagement scaling |
| Min/max | `min(likes × 2, 500)` | Cap contribution of any one signal |

### UI approach

Rather than exposing raw expression editing for these (which is what the JSON textarea does), the UI could offer:

1. **Recipe presets** — one-click formulas: "Engagement rate", "Log-scaled", "Fairness-adjusted"
2. **Signal builder** — drag signals, pick transform (raw, log, sqrt, capped), set weight
3. **Advanced mode** — the raw JSON editor (already exists) for full control

The toggle/dial UI we have today would remain as the simple "Engagement" mode. Custom formula mode would gain access to the new operators via presets + the raw editor.

### Implementation priority

1. Add new node types to `L2Expr` in core-types — **DONE** ✅
2. Implement evaluator support in `l2-eval/src/expr.ts` — **DONE** ✅
3. Formula Builder UI (`SortFormulaBuilder` component) — **DONE** ✅
   - Per-signal transforms (linear, log, sqrt, power, capped)
   - Derived signals / ratios (numerator ÷ denominator with guard)
   - Conditional bonuses (if field op value then +/× amount)
   - Time decay curves (none, exponential, linear, step)
   - Global limits (score cap, floor, author fairness)
   - Compiler: `SortFormula` config → `L2Expr` tree
4. Add recipe presets to the Custom formula UI — **DONE** ✅
5. Eventually: visual formula builder (node-based? or step-by-step wizard?)

---

## Sorting vs Personalization — The Two Layers

These are complementary, not alternatives:

| | Sorting | Personalization |
|---|---|---|
| **When** | Eval time (background reeval) | Serve time (per skeleton request) |
| **Scope** | ALL pool posts for the feed | One page of pre-sorted candidates |
| **Viewer-aware** | No — same score for everyone | Yes — knows who's requesting |
| **Input** | Post + metrics + enrichment | Sorted URIs + enriched posts + viewer context |
| **Output** | A number (sort_key) stored in DB | Reordered URI list returned to client |
| **Cost** | Once per reeval cycle | Every getFeedSkeleton request |
| **Data access** | Post fields, metrics, enrichment | All of sorting's data PLUS: viewer DID, follow graph, interaction history, impression log |

### Why both exist

**Sorting** answers: "Objectively, how good/relevant is this post?"
- ML quality scores, engagement metrics, content signals, time decay
- Same answer regardless of who's asking
- Pre-computed, cheap at serve time

**Personalization** answers: "For THIS specific viewer, what order makes sense?"
- Social proximity (do you follow this author? do your friends engage with them?)
- Already-seen suppression (push down posts you've scrolled past)
- Interest affinity (you engage with art posts → boost art)
- The near-you feed is a perfect example: it needs the viewer's follow graph to determine social distance

### Personalization is NOT limited to one page

The current implementation passes one pre-sorted page (~50 posts) to the personalization plugin. **This is wrong and will be changed.** Personalization must have access to the full candidate set (or a configurable window) to be useful.

**Correct model:**

The personalization plugin receives:
- `candidates`: the FULL candidate set for the feed (or top N by sort_key, configurable)
- `candidatePosts`: enriched post data for those candidates
- `viewerDid`: who's requesting
- `viewer`: complete viewer context (follow graph, interaction history, impressions)
- `limit`: how many posts to return for this page
- `cursor`: pagination state (what was already served)
- `config`: user-tunable settings from the feed config

The plugin returns:
- Ordered list of URIs for this page (respecting limit)
- Updated cursor for next page

This means personalization plugins effectively **replace the pagination logic** — they decide what posts appear and in what order, drawing from the entire pool of scored candidates.

**Configurable window:**

Feed owners can tune how many candidates personalization sees:

```jsonc
{
  "rank": {
    "rankerRef": {
      "packageId": "social-proximity",
      "versionPin": "2.0.0",
      "config": {
        "candidateWindow": 5000,
        "boostFollowed": true,
        "suppressSeen": true
      }
    }
  }
}
```

`candidateWindow: 5000` = "look at the top 5000 posts by sort_key, pick and order 50 for this page." Users with lower-end hardware can set this to 500. Users who want maximum personalization set it higher.

**Plugin-defined user settings:**

Personalization plugins can expose tunable config via a `configSchema` in their manifest:

```jsonc
{
  "configSchema": {
    "candidateWindow": { "type": "number", "default": 2000, "min": 100, "max": 50000, "label": "Posts to consider" },
    "boostFollowed": { "type": "boolean", "default": true, "label": "Boost posts from followed accounts" },
    "suppressSeen": { "type": "boolean", "default": true, "label": "Push down already-seen posts" },
    "diversityFactor": { "type": "number", "default": 0.3, "min": 0, "max": 1, "label": "Author diversity (0=off, 1=max)" }
  }
}
```

The feed's Sorting tab renders these as toggles/sliders based on the schema. Users tune the plugin without touching code.

### Updated contract

```typescript
interface PersonalizationInput {
  feedId: string
  limit: number
  cursor?: string
  // Full candidate set (or top N by sort_key)
  candidates: Array<{
    uri: string
    sortKey: number
    authorDid: string
    indexedAt: string
    // enriched post data
    post?: NormalizedPost
    metrics?: PostMetrics
    enrichment?: Record<string, unknown>
  }>
  viewerDid: string
  viewer: ViewerContext  // follow graph, interactions, impressions
  config?: Record<string, unknown>  // user-tunable settings
}

interface PersonalizationOutput {
  uris: string[]  // ordered page (length <= limit)
  cursor?: string  // for next page
}
```

### Personalization scope — lightweight vs heavy (future)

**Current design (v1): Lightweight personalization**

Personalization receives pre-sorted candidates and applies viewer-specific adjustments:
- Boost posts from followed/mutual authors
- Suppress already-seen posts
- Author diversity (don't show 5 posts from same person in a row)
- Interest affinity (boost content matching viewer's behavioral signals)

This is sufficient for most use cases, especially when paired with a powerful custom sort pack that handles the heavy scoring. A bundle of sort pack + personalization covers ~90% of what a monolithic viewer-aware scorer (like near-you) does.

**Future (v2): Heavy personalization**

A personalization plugin that receives the full candidate set and computes its own final ordering from scratch, using viewer context + base scores + its own signals. Essentially a full viewer-aware scorer running at serve time. Expensive but maximally flexible.

This is documented as a future capability. For v1, the sort pack + lightweight personalization bundle pattern is the recommended approach for complex feeds.

### Why two passes is efficient enough

Each feed has its own sort formula → different scores per feed. The raw data (metrics, enrichment) is shared, but scoring is per-feed. Two passes works because:

1. **Sorting (per feed, once at eval):** Score all candidates with the feed's formula. Expensive but only runs on reeval (not per request).
2. **Personalization (per viewer, per request):** Lightweight adjustments on the pre-sorted list. Cheap because the hard work is done.

The sort pack handles 90% of the intelligence. Personalization is the final 10% viewer-specific touch.

### Bundles: Sorting + Personalization

A creator who wants full control ships both:
- **Sort pack:** "My ML model scores every post for quality" (runs once at eval)
- **Personalization plugin:** "My algorithm uses viewer interaction history to fine-tune order" (runs per request)

Bundled together in the marketplace as a single subscribe action. The sorting layer does the heavy lifting cheaply; personalization adds the per-viewer touch.

---

## Package Tiers (Updated)

| Category | Native | Custom Code |
|----------|--------|-------------|
| **Logic Blocks** | JSON rule group (current ✅) | WASM predicate: post → match/score |
| **Sort Packs** | L2Expr formula (current ✅) | WASM scorer: post → numeric score |
| **Personalization** | Built-in toggles (boost followed, suppress seen, diversity) | WASM/remote: full viewer-aware rescoring |
| **Injectors** | Pinned posts, rotating posts with expiry/impression limits | WASM/remote: dynamic injection (ads, recommendations) |
| **Enrichers** | ❌ N/A (inherently code) | WASM/remote: post → enrichment fields |
| **Sources** | Other project pools, static URI lists | WASM/remote: external post feeds, APIs, curated lists |

---

## Feed Workspace Tabs

```
Visual Editor | Sorting | Personalization | Injectors | Sources | Settings
```

Each tab corresponds to a pipeline stage. Users configure each stage independently.

---

## Native Personalization

Built-in viewer-specific adjustments configured via toggles on the Personalization tab. No custom code needed.

### Config shape

```jsonc
{
  "personalization": {
    "boostFollowed": { "enabled": true, "factor": 1.3 },
    "boostMutuals": { "enabled": true, "factor": 1.5 },
    "suppressSeen": { "enabled": true, "penalty": 0.5, "window": "48h" },
    "authorDiversity": { "enabled": true, "maxConsecutive": 2 },
    "affinityBoost": { "enabled": false, "factor": 1.2, "window": "30d" }
  }
}
```

### Available native personalization options

- **Boost followed:** Posts from accounts the viewer follows get score multiplied by factor
- **Boost mutuals:** Posts from mutual follows get an additional multiplier
- **Suppress seen:** Posts the viewer has already been served get penalized (requires impression tracking)
- **Author diversity:** Prevent N+ consecutive posts from the same author in a page
- **Affinity boost:** Boost posts from authors the viewer frequently interacts with (likes, replies)

All receive viewer context (viewer DID → follow graph, impression history, interaction log).

Future native options could include:
- Interest affinity (boost content matching viewer's behavioral signals)
- Time-of-day preferences
- Freshness adaptation (widen window when viewer returns after absence, like near-you)

### Custom code personalization

Receives full candidate set + viewer context, computes personalization_score per candidate:

```
personalization_score = sort_key * followBoost * affinityFactor - seenPenalty + interestBonus
```

Returns ordered page. Has access to everything native personalization has plus arbitrary logic.

---

## Injectors (Expanded)

Run last in the pipeline. Splice additional posts into the finalized page.

### Native injectors

**Pinned posts:**
```jsonc
{
  "type": "pinned",
  "posts": [
    {
      "uri": "at://did:plc:.../app.bsky.feed.post/abc",
      "position": 0,
      "expiresAt": "2025-02-01T00:00:00Z",
      "maxImpressions": 3
    }
  ]
}
```
- Fixed position in page
- Expiry date (stop showing after date)
- Max impressions per viewer (stop showing after N views)
- Viewer context: tracks how many times this viewer has seen it

**Rotating posts:**
```jsonc
{
  "type": "rotating",
  "pool": [
    "at://did:plc:.../app.bsky.feed.post/featured1",
    "at://did:plc:.../app.bsky.feed.post/featured2",
    "at://did:plc:.../app.bsky.feed.post/featured3"
  ],
  "interval": 10,
  "maxPerPage": 1,
  "rotation": "round-robin",
  "perViewerMaxImpressions": 5,
  "expiresAt": "2025-03-01T00:00:00Z"
}
```
- Pool of posts to cycle through
- Interval: inject one every N organic posts
- Rotation strategy: round-robin, random, least-shown
- Per-viewer impression cap
- Pool-level expiry

### Custom code injectors

Receive the finalized page + viewer context, return additional URIs to inject:

```typescript
interface InjectorInput {
  feedId: string
  limit: number
  page: string[]  // current page URIs (post-personalization)
  slots: FeedInjectorSlots
  viewerDid: string
  viewer: ViewerContext  // follow graph, impressions, interactions
  config?: Record<string, unknown>
}

interface InjectorOutput {
  inject: Array<{ uri: string; position?: number }>
}
```

Primary use case: **ad networks**. An ad injector plugin connects to an external ad service, picks relevant ads based on viewer context, and injects them respecting slot rules.

Other use cases:
- Cross-feed discovery (inject trending posts from related feeds)
- Onboarding content for new viewers
- Dynamic announcements based on viewer attributes

### Viewer context for injectors

Both native and custom code injectors receive viewer context:
- `viewerDid` — who's requesting
- Impression history — what this viewer has already seen (for frequency capping)
- Follow graph — for relevance (don't inject posts from blocked authors)
- Interaction history — for personalized injection decisions

### Multiple injectors

A feed can have multiple injectors stacked. They run in declared order, each seeing the output of the previous:

```jsonc
{
  "injectors": [
    { "type": "native", "config": { "type": "pinned", "posts": [...] } },
    { "packageId": "ad-network", "versionPin": "1.0", "slots": { "every": 8, "maxPerPage": 2 } }
  ]
}
```

Slot rules are enforced globally — total injections across all injectors can't exceed a feed-level cap.

---

## Sources (New Category)

Sources feed posts INTO the evaluation pipeline. The default source is the project's candidate pool (the START node in the visual editor). Custom sources add additional post streams that go through the same L2 evaluation logic.

### What they do

Provide additional posts for the visual editor to evaluate. Unlike injectors (which bypass evaluation and splice into the final page), source posts go through all match/exclude/score rules.

### Examples

- **Another project's pool** — evaluate posts from a different project alongside your own
- **Another feed's candidates** — pull from someone else's curated feed
- **External API** — fetch posts from a URL endpoint
- **Curated URI list** — static or dynamic list of AT-URIs to include in evaluation
- **Trending posts** — firehose-derived trending content as a source

### Visual editor integration

Sources are enabled on the **Sources tab**. Once enabled, they appear in the visual editor as additional start-like nodes:

```
[START - Pool]──────────┐
                        ├──→ [Include: has video] → [Score: +50] → END
[Source: Art Curation]──┘

[Source: Trending]──→ [Exclude: NSFW] → [Include: >10 likes] → END
```

**Key rules:**
- Enable/disable on Sources tab → node appears/disappears in visual editor
- One instance per source (no duplicates)
- Each source can be wired independently (different logic paths) or merged with pool posts
- Source nodes cannot be dragged in manually — they're controlled from the Sources tab

### Independent vs merged wiring

Posts from different sources can:
1. **Merge** — wire into the same path as START, evaluated by same rules
2. **Independent paths** — wire through different logic (stricter rules for external sources, different scoring)

This is powerful: you might trust your own pool posts fully but want external sources to pass additional quality checks before entering your feed.

### Native sources

- **Project pool** (default START node, always present)
- **Other project's pool** — select another project on this deployment
- **Static URI list** — paste AT-URIs, they get fetched and evaluated

### Custom code sources

```typescript
interface SourceInput {
  feedId: string
  since?: string  // cursor/timestamp for incremental fetching
  limit: number
  config?: Record<string, unknown>
}

interface SourceOutput {
  posts: NormalizedPost[]  // posts to feed into evaluation
  cursor?: string
}
```

Custom sources fetch posts from anywhere and normalize them for evaluation. The visual editor treats them like any other post — they go through match/exclude/score rules.

---

## Enricher + Logic Block Interaction Pattern

### Example: HD Video Filter

**Package 1: `video-analyzer` (Enricher)**
- Runs on posts with `embed.hasVideo: true`
- Uses ffmpeg (via remote endpoint) to probe actual resolution + bitrate
- Writes: `{ actualWidth, actualHeight, bitrate, codec, duration }`

**Package 2: `hd-video-filter` (Custom Logic Block)**
- Depends on `video-analyzer` enrichment
- Config: `{ minWidth: 1920, minBitrate: 3000 }`
- Returns `matched: true` if post has HD video

**OR — without custom code logic block:**
- Install `video-analyzer` enricher
- Use a NATIVE logic block with condition: `enrichment.video-analyzer.actualWidth >= 1920`
- No coding needed for the filter part!

### Example: ML Content Tagger

**Package 1: `content-tagger` (Enricher)**
- Calls an ML API for each post
- Writes: `{ tags: ['art', 'photography'], primaryTag: 'art', confidence: 0.91 }`

**Consumers (any of these work):**
- Native logic block: `enrichment.content-tagger.primaryTag == 'art'`
- Custom logic block that does more complex multi-tag scoring
- Native sort pack: boost `enrichment.content-tagger.confidence` in sort formula
- Another enricher that depends on content tags for deeper analysis

---

## Pipeline (Complete Vision)

```
Jetstream post arrives
  → L1 prefilter (project level)
  → Pool (ingested_posts)
  → ENRICHERS run (on-ingest or background sweep)

Feed evaluation (background reeval):
  → SOURCES provide posts (pool + custom sources)
  → L2 visual editor evaluation:
      → Logic blocks (native JSON OR custom code, read enrichment)
      → Sort formula (native L2Expr OR custom code sort pack)
      → Sort modifiers (add/multiply stack)
  → feed_candidates table (scored)

getFeedSkeleton (per viewer, per request):
  → Load candidates (sorted by sort_key)
  → PERSONALIZATION (native toggles OR custom code, viewer-aware rescoring)
  → INJECTORS (native pinned/rotating OR custom code, viewer-aware)
  → Return skeleton page
```

---

## Dependency System

Packages can declare dependencies:

```jsonc
{
  "dependencies": {
    "enrichers": ["video-analyzer", "content-tagger"],
    "logic_blocks": []  // future: composable logic blocks?
  }
}
```

When subscribing to a package with dependencies:
- UI warns if required enrichers aren't installed
- Optional: auto-subscribe to dependencies
- Posts without required enrichment data: configurable behavior (skip/pass/fail)

---

## Bundles

Publishers often want to ship an enricher + companion logic block(s) together. Bundles provide this.

### What a bundle is
A marketplace listing that wraps multiple packages into a single subscribe action. Each included package remains independent — other packages can depend on just the enricher, or users can subscribe to components individually.

### Bundle manifest
```jsonc
{
  "id": "video-toolkit",
  "type": "bundle",
  "name": "Video Toolkit",
  "description": "HD video detection + resolution-based filtering for your feeds.",
  "includes": [
    { "packageId": "video-analyzer", "kind": "enricher", "role": "data" },
    { "packageId": "hd-video-filter", "kind": "logic_block", "role": "filter" },
    { "packageId": "video-quality-sort", "kind": "sort_pack", "role": "sort" }
  ]
}
```

### Subscribe behavior
- Subscribe to bundle → subscribes to all included packages
- Unsubscribe from bundle → prompts: keep individual packages or remove all?
- Individual packages show "Part of [bundle name]" badge on their listing
- Packages can exist in multiple bundles

### Bundle vs. dependency
- **Dependency:** "I require X to function" (enforced, blocks usage if missing)
- **Bundle:** "These work great together" (convenience, not enforced)

A custom logic block that depends on an enricher declares a dependency. A bundle that ships them together is a publishing convenience.

---

## Open Questions

1. **Enricher trigger model:** On-ingest (fast, simple) vs. background sweep (handles expensive ops) vs. both (config per enricher)?

2. **Enrichment storage:** Column on `ingested_posts` (simple, one read) vs. separate table (cleaner namespacing, easier to invalidate per-enricher)?

3. **Cost/rate limiting:** Enrichers that call external APIs (ML, ffmpeg) could be expensive. Per-enricher rate limits? Budget system?

4. **Enricher scope:** Per-project (only enrich posts in my pool) or global (enrich once, available to all projects)?

5. **Staleness:** When an enricher updates its version, do we re-enrich all existing posts? Just new ones? Configurable?

6. **Security boundary:** Enrichers write to the DB. How do we sandbox what they can write? Only their own namespace? Can they read other enrichers' data?

7. **Should custom logic blocks be able to write?** Or strictly read-only? (I'd say read-only — enrichers are the write path.)

8. **Source evaluation timing:** Do custom sources run at reeval time (background) or on-demand? If a source is an external API, how often do we fetch?

9. **Source post lifecycle:** Do source posts enter the pool permanently or are they ephemeral (only exist during evaluation)? Probably ephemeral for external sources.

10. **Viewer context data:** What exactly gets passed? Follow graph could be huge. Do we pass full graph or just relevant subset (authors of candidates)?

11. **Impression tracking:** Required for native personalization (suppress seen) and injectors (impression caps). Where does this live? Existing `served_post_log` pattern or new system?

12. **Multiple personalization plugins?** Or max one per feed? Probably max one (it produces the final order).

---

## Implementation Priority (when we build this)

### Phase 1: Foundation
1. Enrichment storage schema — `post_enrichments` table — **DONE** ✅
2. Enricher package type + manifest — new kind, trigger config
3. Enricher runtime — background sweep worker
4. Enrichment field access in native logic blocks — `enrichment.*` operand
5. Expanded L2Expr operators — log, sqrt, clamp, conditionals, ratio — **DONE** ✅
6. Formula Builder UI — composable algorithm builder — **DONE** ✅

### Phase 2: Custom Code Evaluation
6. Custom code logic block evaluation — WASM call during L2 eval
7. Custom code sort packs — same pattern
8. Sort modifier stacking (add/multiply)

### Phase 3: Personalization & Injectors
9. Native personalization config + UI tab
10. Viewer context pipeline (impression tracking, follow graph loading)
11. Native injectors (pinned, rotating) with viewer-aware impression caps
12. Custom injectors with viewer context

### Phase 4: Sources
13. Sources tab UI
14. Source nodes in visual editor (auto-appear when enabled)
15. Native sources (other project pool, static URI list)
16. Custom code sources

### Phase 5: Ecosystem
17. Bundle listings in marketplace
18. Dependency declarations + UI warnings
19. Heavy personalization (v2 — full candidate access)
20. Marketplace browse tab for enrichers and sources

---

## Marketplace Structure (Final)

```
Marketplace
Packages
├─ Browse
│   ├─ Featured
│   ├─ Logic Blocks        (native + custom code)
│   ├─ Sort Packs          (native + custom code)
│   ├─ Enrichers           (custom code only)
│   ├─ Personalization     (native + custom code)
│   ├─ Injectors           (native + custom code)
│   ├─ Sources             (native + custom code)
│   └─ Bundles             (multi-package listings)
├─ Subscriptions
└─ Collection (your own packages)
```
