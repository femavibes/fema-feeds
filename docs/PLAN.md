# Custom Feed Builder — Planning Document

> **Status:** Draft v0.5 — living document  
> **Last updated:** 2026-06-17

---

## 1. Vision

A self-hostable platform for building, managing, and publishing **Bluesky custom feeds** (ATProto feed generators). One deployment on a VPS can power **many feeds**, organized into **projects**. Operators configure matching rules, ranking, and behavior through a web UI — or extend the system with **plugins**.

**Unlike Graze:** we do **not** store the full firehose. We evaluate posts in a strict **order of operations** and persist **only matched candidates** (plus minimal cache needed to serve feeds). This is the hardest problem and the main lesson from the first attempt.

**Reference repos** (see [`REFERENCE_AUDIT.md`](./REFERENCE_AUDIT.md)):

| Repo | Role |
|------|------|
| `femavibes/feed-gen` | Prior feed builder — Jetstream, visual graph, **lessons on what not to repeat** |
| `therichferro/ATlas-Near-You-Feed` | Near You + ATlas — **borrow** Jetstream TS, scoring engine, algos |

Local snapshots: `_ref/femavibes-feed-gen/`, `_ref/therichferro-ATlas-Near-You-Feed/`

**Code principles:** see [`MODULARITY.md`](./MODULARITY.md)

- Modular packages, **small files**, one concern per module
- Step-by-step delivery — solid core before features
- No premature complexity (one Bluesky account, monolith-first)
- **Current build slice:** [`BUILD_INGEST_L1.md`](./BUILD_INGEST_L1.md)

---

## 2. Core Concepts

| Concept | Description |
|---------|-------------|
| **Deployment** | One VPS instance. One Jetstream connection. One Postgres DB. |
| **Project** | Owns a **Level 1 prefilter** and a shared post pool. Groups multiple feeds. |
| **Level 1 (L1)** | Aggressive, cheap Jetstream prefilter — defines the **project pool**. Runs in real time. |
| **Level 2 (L2)** | Graze-style feed logic on the pool only — nested rules, refinement, per-feed. |
| **Project pool** | Logical view: posts whose L1 matched **this** project. Not a duplicate copy of post data. |
| **Ingested post** | Deployment-wide row, stored **once** per URI. Tagged with which project(s) matched. |
| **Feed** | Published Bluesky custom feed. L2 rules + ranking. Reads from project pool. |
| **Feed candidate** | Post that passed L2 for a specific feed — longer retention. |
| **Plugin** | Signed extension (ingest, rank, inject, …). |

**The mental model:**

```
Jetstream  →  L1 (per project, aggressive prune)  →  project pool  →  L2 (per feed, Graze-like)  →  feed candidates
```

We do **not** store the firehose. We store each matched post **once**, tag it with project association(s), then L2 narrows further into feed candidates.

**Storage priority:** L1 embed flags (`has_video`, `has_image`, …) stay **separate** — excluding all image posts alone is a massive disk win. No combined `has_media` shorthand in v1; operators pick exactly what to prune.

---

## 3. Two-Layer Filter Architecture

### 3.0 Why two layers?

| | Graze | Us |
|---|-------|-----|
| Storage | All posts | L1 pool + feed candidates only |
| Builder | Complex tree on full DB | **Same complex tree, but L2 runs on L1 pool** |
| Stream | N/A | L1 prunes aggressively in real time |

**Level 1** answers: *"Is this post even worth keeping for this project?"*  
**Level 2** answers: *"Which feed(s) in this project should use it?"*

L1 is configured **per project**. The backend **merges** all active project L1 configs into **one Jetstream evaluation pass** per post (normalize once, eval many). Each project enables its own L1 toggles from the shared filter registry.

### 3.1 End-to-end flow

```
Jetstream event
    │
    ▼
┌──────────────────────────────────────┐
│ NORMALIZE (once per post)            │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│ MERGED L1 EVAL (all projects)        │
│ Fixed step order; per-project config │
│ Returns: which project IDs matched   │
└──────────────────┬───────────────────┘
                   │
              0 projects → discard (no DB)
                   │
              1+ projects ▼
┌──────────────────────────────────────┐
│ WRITE ingested_post (once per URI)   │
│ + project association tags           │
│   matched_via: author | jetstream    │
└──────────────────┬───────────────────┘
                   ▼
         for each feed (L2 scope check)
                   ▼
┌──────────────────────────────────────┐
│ L2 FEED LOGIC (Graze-style)          │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│ WRITE feed_candidate + rank          │
└──────────────────────────────────────┘
```

### 3.1.1 Project association & pool scope

Every ingested post is **flagged with which project(s) it matched** at L1.

| Setting | Scope | Default |
|---------|-------|---------|
| `l2_pool_scope: global` | Feed L2 sees **all** ingested posts on the deployment | **yes** |
| `l2_pool_scope: project_only` | Feed L2 sees only posts tagged with **its** project | opt-in |

**Why default global:** a post about Springfield might match both "Local News" and "Western Mass" projects — feeds can all use it without duplicating storage.

**Why offer `project_only`:** operator wants strict isolation (e.g. adult vs family project on same VPS).

Association metadata per tag: `project_id`, `matched_via` (`author` | `jetstream` | `plugin`).

**L1 is aggressive** — VPS operators *want* to throw away most posts here.  
**L2 is expressive** — operators get Graze-like granularity without scanning the full firehose.

### 3.2 Level 1 — filter registry (extensible)

L1 filters are **simple toggles/lists only**. No nested logic at L1 (that lives in L2).  
Each filter: pass / fail / skip (disabled). New filters can be added to the registry over time without changing the pipeline shape — each is one small module file.

**v1 filters:**

| ID | Filter | Cost | What it checks | Example use |
|----|--------|------|----------------|-------------|
| L1-01 | `labels` | trivial | Moderation labels, NSFW, block-labels | Drop labeled spam early |
| L1-02 | `post_kind` | trivial | root / reply / quote / repost | Text feed: no replies |
| L1-03 | `language` | cheap | `record.langs` vs allowlist | English only |
| L1-04 | `language_unknown` | cheap | Policy when `langs` empty | `include` / `exclude` / `detect` |
| L1-05 | `author_blocklist` | cheap | DID in block set | Banned accounts |
| L1-06 | `author_allowlist` | cheap | DID in project author list | Triggers fast-path — §3.4 |
| L1-07 | `has_video` | cheap | embed has video | Video project: `require` |
| L1-08 | `has_image` | cheap | embed has image | Exclude all images = huge savings |
| L1-09 | `has_link_card` | cheap | external / link embed | Link roundup |
| L1-10 | `has_quote` | cheap | quote embed present | |
| L1-11 | `has_record` | cheap | record/repost embed | |
| L1-12 | `has_text_only` | cheap | no embed / text only | Text-only project |
| L1-13 | `hashtag_include` | medium | facet hashtag in set | |
| L1-14 | `hashtag_exclude` | medium | facet hashtag in block set | |
| L1-15 | `keyword_include` | **expensive** | terms in text / alt / link title | Last resort gate |
| L1-16 | `keyword_exclude` | **expensive** | block terms | |

*Future:* `has_gif`, `min_text_length`, label allowlists, etc. — same registry pattern.

**Not at L1:** regex, nested AND/OR, social graph, ML, combined media shorthand.

**Plugin ingest** posts skip Jetstream L1 but must land in a project pool via the plugin adapter (same normalized shape).

### 3.3 Level 1 — order of operations

Fixed order at runtime. **Cannot reorder** in v1 — keeps Jetstream path predictable and fast.  
Operators enable only the filters they need; disabled = skip.

```
 1. labels
 2. post_kind
 3. author_allowlist     ← fast-path check (§3.4)
 4. author_blocklist
 5. language
 6. language_unknown
 7. has_video            ┐ separate flags — mix & match
 8. has_image            │ e.g. require video, exclude images
 9. has_link_card        │
10. has_quote            │
11. has_record           │
12. has_text_only        ┘
13. hashtag_exclude
14. hashtag_include
15. keyword_exclude
16. keyword_include
```

**Why this order:**

| Position | Rationale |
|----------|-----------|
| labels, post_kind first | Single-field bitmask; kills huge % of firehose |
| author_allowlist early | Listed reporters bypass language/embed gates when configured |
| language before embeds | One array check; very cheap; aggressive VPS prune |
| embed flags before hashtags | Structural JSON check, no string parsing |
| hashtags before keywords | Facets are pre-parsed; smaller search space |
| keywords last | Most CPU per post; only run if post survived everything else |

**Example — video project:**

```
L1 enabled: post_kind=root only, language=en, has_video=required
→ all non-video posts discarded at step 7, never hit keywords
```

**Example — local news project:**

```
L1 enabled: language=en (unknown=include), keyword_include=[springfield, spfld]
→ broad pool; individual feeds refine in L2
```

### 3.4 Author allowlist — granular bypass

Author lists exist to pull in **their posts** without the same Jetstream gates. But not everything should be bypassed — a listed reporter posting NSFW might still need to hit `labels`.

**Per author-list config:**

```yaml
author_list:
  list_id: reporters
  fast_path:
    enabled: true
    bypass_steps:        # skip these L1 steps for listed authors
      - language
      - language_unknown
      - has_video
      - has_image
      - has_link_card
      - has_quote
      - has_record
      - has_text_only
      - hashtag_include
      - hashtag_exclude
      - keyword_include
      - keyword_exclude
    never_bypass:        # safety floor — always enforced
      - labels
      - post_kind
      - author_blocklist
```

**Defaults when operator imports a list:**
- `fast_path.enabled: true`
- `bypass_steps: all except never_bypass` → effectively "all their posts" minus moderation/post-kind rules
- Operator can uncheck individual bypass toggles in UI ("reporters still must be English")

`matched_via: author` stored on the project association tag for stats.

### 3.5 Merged L1 across projects

One Jetstream consumer, one normalize, one pass through the fixed step order:

```
for post in jetstream:
    normalized = normalize(post)
    matched_projects = []
    for project in active_projects:
        result = l1_eval(normalized, project.compiled_l1)
        if result.pass:
            matched_projects.push({ id, matched_via: result.via })
    if matched_projects.empty: discard
    else:
        upsert ingested_post(normalized)          # once per URI
        set project tags on ingested_post
        for feed in feeds_where_l2_applies(post):
            if l2_eval(normalized, feed): write_candidate()
```

**Compile at deploy/save:** each project's enabled L1 filters → `CompiledL1`. Global orchestrator runs steps once, branches per-project only where configs differ.

**Cross-project optimization:** if zero projects enable `keyword_include`, skip keyword trie build entirely.

### 3.6 Level 2 — feed builder (Graze-like)

Runs **only** on posts already in the project pool. This is where complexity lives:

- Nested `ALL of` / `ANY of` / `NONE of`
- Per-feed author lists (finer than project list)
- Keyword include/exclude on specific fields (text, alt, embed title, …)
- Regex, embed-type combos, reusable snippets / custom nodes
- Plugin filter hooks

**Persistence rule:**

> `project_pool_post` — post passed L1 for this project  
> `feed_candidate` — post passed L2 for this feed

Operators can think of L2 exactly like Graze's builder — because the pool *is* our mini-Graze-DB.

### 3.7 What we store

| Table | When | Notes |
|-------|------|-------|
| `ingested_posts` | L1 pass for ≥1 project | **One row per URI** — deployment-wide dedup |
| `ingested_post_projects` | same | `post_uri`, `project_id`, `matched_via` |
| `feed_candidates` | L2 pass | Per feed, longer retention |
| **Not stored** | L1 fail for all projects | Discarded in memory |

TTL / prune applies to `ingested_posts` (deployment disk budget). Feed candidates prune separately.

### 3.8 Project L1 config (example)

```yaml
project: springfield-news
level1:
  author_lists:
    - list_id: reporters
      fast_path:
        enabled: true
        bypass_steps: [language, language_unknown, has_video, has_image,
                       has_link_card, hashtag_include, keyword_include, keyword_exclude]
  post_kind: [root]
  language: { allow: [en], unknown: include }
  has_image: exclude              # aggressive — no images in this project pool
  keyword_include:
    terms: [springfield, spfld]
    fields: [text]
```

```yaml
project: video-creators
level1:
  post_kind: [root, quote]
  language: { allow: [en], unknown: exclude }
  has_video: required          # aggressive — non-video never reaches pool
  keyword_include:
    terms: [tutorial, review]
    fields: [text]
```

### 3.9 UI split for layers

| Surface | Configures |
|---------|------------|
| **Project settings** | L1 filters, pool TTL, author lists, disk budget |
| **Feed builder** | L2 Graze-style logic, ranking, publish |
| **Stats** | L1 drop rate per step, pool size, L2 hit rate, feed counts |

---

## 4. Retention & Storage (deployment-aware)

Retention is **operator-configured** in backend settings, informed by VPS disk.

| Setting | Description |
|---------|-------------|
| `max_candidates_per_feed` | Hard cap; prune lowest-score or oldest |
| `max_age_days` | TTL by `indexed_at` |
| `disk_budget_mb` | Soft cap; system warns then prunes |
| `prune_strategy` | `oldest_first` / `lowest_score_first` / `hybrid` |
| `posts_cache_level` | `minimal` / `full` / `none` (skeleton-only URIs) |

Prune runs as a background worker. Stats UI shows disk usage, candidate counts, prune history.

---

## 5. Admin UI — Three Surfaces

The web app is three distinct areas:

### 5.1 Backend / Settings (technical)
- Jetstream connection, reconnect, lag
- Bluesky service account (one for now; multi-account later)
- DNS / TLS / public URL
- **Retention & disk budget**
- Database health, worker status
- Plugin install permissions
- Audit log

### 5.2 Feed Builder (operator creative)
- Project L1 config (simple toggles — language, embeds, keywords, author list)
- Per-feed L2 canvas — Graze-style nested nodes
- Author list import (DIDs, handles, Bluesky lists)
- Ranking mode selection
- **Match trace preview** — L1 step-by-step + L2 tree breakdown
- Publish wizard

### 5.3 Stats & Numbers
- L1 drop rate **per step** (where posts are being pruned)
- Project pool size vs disk budget
- L2 hit rate per feed
- `getFeedSkeleton` latency
- Top authors, keyword hit rates
- Error rates (Jetstream, plugins)

---

## 6. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Admin UI:  Settings  │  Builder  │  Stats                               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│  API (control plane)                                                     │
└───────┬───────────────────────────────┬─────────────────────────────────┘
        │                               │
        ▼                               ▼
┌───────────────────┐           ┌─────────────────┐
│  Filter Engine    │◄──────────│ Plugin Runtime  │
│  compile + eval   │           │ (phased)        │
└─────────┬─────────┘           └─────────────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────────────────────────────────┐
│  Jetstream ingest │     │  Plugin ingest adapters (same PostEvent shape) │
└─────────┬─────────┘     └───────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PostgreSQL — candidates, feeds, compiled_rules, settings, plugins       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Feed Generator — getFeedSkeleton / describeFeedGenerator                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Monolith-first:** single Node process with internal modules. Split services only when measured pain.

### Package layout (draft)

```
packages/
  post-normalize/      # Jetstream → NormalizedPost
  l1-filters/            # one file per L1 step (language.ts, has_video.ts, …)
  l1-compile/            # project L1 config → CompiledL1
  l1-eval/               # runtime L1 + trace
  l2-filters/            # Graze-style L2 nodes (one file each)
  l2-compile/              # feed rule tree → CompiledL2
  l2-eval/               # runtime L2 on pool posts
  ingest-jetstream/      # connection, reconnect, cursor
  rank/                  # scoring engine (ported later)
  feedgen/               # ATProto endpoints
  plugins-sdk/           # types, manifest schema
apps/
  api/
  web/
  worker/                # prune pool, backfill, publish
```

---

## 7. Jetstream Ingestion

Reference: **ATlas-Near-You-Feed** (audit when repo is accessible).

- One Jetstream consumer per deployment
- Normalize once, fan out to filter engine
- Reconnect with cursor; expose lag in Stats
- Dedup by `(uri)` in memory window before eval

*Docs: https://docs.bsky.app/docs/advanced/jetstream*

---

## 8. Native Ranking

Port scoring/personalization from reference project **later** (Phase 3). Until then: chronological.

| Mode | Behavior |
|------|----------|
| `chronological` | Newest first |
| `ranked` | Native scoring engine |
| `plugin` | Plugin ranker |

**Viewer-aware ranking:** TBD — default assumption is **same skeleton for all viewers** (simpler, matches most custom feeds). Revisit if needed.

---

## 9. Plugin System

> **Canonical reference:** [MARKETPLACE_ECOSYSTEM.md](./MARKETPLACE_ECOSYSTEM.md) — extension kinds, logic blocks (shipped), standard formats, registry, API, roadmap.

### 9.1 Marketplace
- Curated registry in the UI
- Community submissions with **review before listing**
- Operator opt-in install; permission summary
- **Ad plugins:** allowed, operator opt-in only, disclosure in feed metadata

### 9.2 Recommended runtime (phased — helps with Q7)

| Phase | Runtime | Use case |
|-------|---------|----------|
| **MVP** | No plugins in hot filter path | Ship core filter engine first |
| **v1** | **Node worker threads** — timeout, memory cap, no direct DB | Trusted curated plugins: rank, inject, enrich |
| **v2** | **Separate ingest adapter process** | RSS, ads, custom importers — emits `PostEvent` |
| **v3** | **WASM sandbox** | Untrusted community plugins in marketplace |

**Why not WASM day one:** slows MVP; your priority is solid filter order. Node workers are enough for curated plugins you approve.

**Filter plugins:** avoid in v1 hot path if possible — custom logic belongs in rule tree nodes or post-match hooks. Ingest plugins are isolated adapters (safer).

### 9.3 Hooks (post-match first)

```
onPostMatched(post, feed, trace)   # after rule tree pass
onEnrich(post, feed)
onScore(post, feed) → score
onSort(candidates, feed)
onInject(feed, page)               # ads, synthetic posts
```

---

## 10. ATProto Feed Generator

- One Bluesky service account per deployment **for now**
- Multi-account support deferred
- Hostname model **TBD** — single domain with feed param is simplest start
- No artificial feed count limit — design for index efficiency, measure later

Standard endpoints: `getFeedSkeleton`, `describeFeedGenerator`.

---

## 11. Data Model (updated)

```
projects
  id, name, l1_config_json, compiled_l1_blob

feeds
  id, project_id, name, uri, sort_mode
  l2_rule_tree_json, compiled_l2_blob
  l2_pool_scope (global | project_only)   # default: global
  retention overrides, settings_json

ingested_posts
  post_uri PK, cid, author_did, indexed_at
  normalized_summary_json, expires_at

ingested_post_projects
  post_uri, project_id, matched_via (author|jetstream|plugin)

feed_candidates
  feed_id, post_uri, cid, score, sort_key, expires_at

author_lists
  id, project_id, name, dids_json, fast_path_json

rule_snippets
deployment_settings
plugins_installed
audit_log
users
```

---

## 12. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | **TypeScript** | ATProto SDK, matches reference repo direction, small modules |
| API | **Hono** or **Fastify** | Lightweight |
| UI | **React + Vite** | Rule tree builder |
| DB | **PostgreSQL + Drizzle** | JSON for trees, blob for compiled rules |
| Monorepo | **pnpm workspaces** | `packages/*`, `apps/*` |

Redis optional later for backfill queues — not required for MVP.

---

## 13. MVP Phases

### Phase 0 — Foundation
- [x] Monorepo scaffold, package boundaries documented
- [x] `NormalizedPost` type + normalize module
- [x] L1 eval skeleton with trace output + unit tests
- [ ] Jetstream live connect (needs Node + `JETSTREAM_URL`)

### Phase 1 — Level 1 engine (the core)
- [x] L1 filters as **one file each**
- [x] Fixed order of operations (§3.3)
- [x] Project L1 config + compiler → `CompiledL1`
- [ ] `ingested_posts` persistence + TTL prune (slice 2)
- [x] Unit tests: video feed kills non-video; author bypass

### Phase 2 — Level 2 + feed builder
- [ ] L2 Graze-style rule tree on pool posts only
- [ ] `feed_candidates` persistence
- [ ] Match trace: L1 steps + L2 tree
- [ ] Author list import + fast-path bypass

### Phase 3 — Feedgen + publish
- [ ] `getFeedSkeleton` chronological
- [ ] One service account publish flow

### Phase 4 — UI + stats
- [x] Project L1 settings panel (`apps/web`)
- [ ] Feed L2 builder canvas
- [ ] Stats: L1 drop rate per step, pool size, L2 hit rate

### Phase 5 — Ranking
- [ ] Port scoring engine from reference project

### Phase 6 — Plugins + marketplace
- [ ] SDK, curated registry, worker-thread runtime

---

## 14. Decisions Log

| # | Question | Decision |
|---|----------|----------|
| 1 | Reference project | [ATlas-Near-You-Feed](https://github.com/therichferro/ATlas-Near-You-Feed) — rewrite slowly, modular |
| 2 | First attempt lesson | Needed two layers: aggressive L1 at Jetstream, Graze-like L2 on pool |
| 14 | L1 embed flags | **Separate** (`has_video`, `has_image`, …) — no combined shorthand |
| 15 | Author fast-path | **Granular bypass** per step; `labels` + `post_kind` never bypassed |
| 16 | Pool scope | Default **global** L2 access; optional `project_only` per feed |
| 17 | Post storage | **Once per URI** + project association tags |
| 18 | L1 extensibility | Filter registry — add more pre-filters over time |
| 3 | Stack | TypeScript, small files, monorepo — finalize on scaffold |
| 4 | Viewer-aware ranking | **TBD** — lean global skeleton first |
| 5 | Retention | Deployment-specific; disk budget in backend settings |
| 6 | Repost/quote/reply | **All configurable** per feed in rule tree |
| 7 | Plugin runtime | Phased: none → Node workers → WASM for untrusted |
| 8 | Marketplace | Curated + community review |
| 9 | Ads | Operator opt-in + disclosure |
| 10 | Scale | No artificial limits; optimize indexes |
| 11 | Hostname | TBD |
| 12 | Bluesky accounts | One per deployment for now |
| 13 | Approach | Slow, step-by-step, modular, solid over feature-rich |

---

## 15. Open Questions (remaining)

1. **Viewer-aware ranking** — worth the complexity for v1?
2. **Hostname** — single domain + path vs subdomain per feed?
3. **Language detect** — which library when `unknown: detect`? (franc, fastText, CLD3?)
4. **ATlas repo** — private/inaccessible from here; share key files when you can (Jetstream handler, scoring).
5. **Bluesky list import** — resolve list → DIDs at import time, or refresh periodically?
6. **Rule tree JSON schema** — mirror Graze manifest closely for familiarity, or design our own?

---

## 16. Next Steps

1. **You:** confirm branch/language behavior examples match your mental model (see §3.4).
2. **You:** pull up ATlas repo — we'll extract Jetstream + scoring patterns into spike modules.
3. **Us:** Phase 0 scaffold + `NormalizedPost` + filter step interface (`evaluate(ctx) → pass | fail | skip`).
4. **Us:** compiler spike — one feed, author branch + discovery branch, trace output in tests.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-06-16 | Initial draft |
| 0.2 | 2026-06-16 | Order-of-ops filter pipeline, nested branches, selective persistence, UI split, decisions log, phased plugins |
| 0.3 | 2026-06-16 | Sources + Paths model — reconciles visual builder with selective persistence |
| 0.4 | 2026-06-17 | Two-layer architecture: L1 Jetstream prefilter (ordered steps) + L2 Graze builder on project pool |
| 0.5 | 2026-06-17 | Merged L1, deduped ingest + project tags, granular author bypass, separate embed flags, pool scope setting |
| 0.5.1 | 2026-06-17 | Reference audit from feed-gen + ATlas repos |
