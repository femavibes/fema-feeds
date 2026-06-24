# Build Slice: Ingestion + L1 Prefilter

> **Status:** In progress  
> **Goal:** Jetstream → normalize → merged L1 eval → sink (console/memory first, Postgres second)  
> **Jetstream compile/eval:** see [JETSTREAM_INGEST.md](./JETSTREAM_INGEST.md)

---

## What we have from reference repos

| Source | What we pulled | Enough to build? |
|--------|----------------|------------------|
| `femavibes/feed-gen` | Docs + `schema.sql` only locally | **Partial** — `INGESTION.md` is gold; Python source not cloned yet |
| `therichferro/ATlas-Near-You-Feed` | `subscription.ts`, `scoring/engine.ts`, `ARCHITECTURE.md` | **Partial** — Jetstream patterns visible; full repo not cloned |

You do **not** need to hand us the whole repo to start. We can build L1 from the plan + feed-gen docs. Cloning `feed-gen` locally (or into `_ref/`) helps when we port field-path logic for L2 later.

---

## Slice 1 scope (this build)

### In scope
- [x] Monorepo scaffold (`packages/*`, `apps/ingest`)
- [ ] `core-types` — `NormalizedPost`, `ProjectL1Config`, `L1EvalTrace`
- [ ] `post-normalize` — Jetstream record → `NormalizedPost`
- [ ] `l1-registry` — step order, filter interface
- [ ] `l1-filters` — labels, post_kind, language, has_video, has_image, has_link_card, keywords (incremental)
- [ ] `l1-compile` — project config → `CompiledL1`
- [ ] `l1-eval` — merged multi-project eval + author fast-path bypass
- [ ] `ingest-jetstream` — `@skyware/jetstream` consumer (from ATlas pattern)
- [ ] `apps/ingest` — CLI: connect, eval, print trace / stats
- [ ] Unit tests for L1 order-of-ops

### Out of scope (next slices)
- Postgres persistence
- L2 graph engine
- Web UI
- Feed generator HTTP API

---

## Default decisions (change anytime)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Matches ATlas; one runtime |
| Jetstream lib | `@skyware/jetstream` | Already used in ATlas `subscription.ts` |
| First sink | stdout + optional JSON lines | No DB until L1 is proven |
| Project config | JSON files in `config/projects/*.json` | No UI yet |
| Tests | `vitest` | Fast, ESM-native |

---

## Package dependency graph

```
apps/ingest
  → ingest-jetstream
  → l1-eval
  → l1-compile
  → (sink interface)

l1-eval → l1-compile, l1-filters, l1-registry, core-types
l1-filters → l1-registry, core-types
l1-compile → core-types
post-normalize → core-types
ingest-jetstream → post-normalize, core-types
```

---

## L1 eval contract

**Input:** `NormalizedPost` + `CompiledL1[]` (one per active project)

**Output:**
```ts
interface L1MergedResult {
  postUri: string
  matchedProjects: Array<{
    projectId: string
    matchedVia: 'author' | 'jetstream'
    trace: L1StepTrace[]  // per-step pass/fail/skip/bypass
  }>
}
```

If `matchedProjects` is empty → post is discarded (no sink write).

---

## CLI (apps/ingest)

```bash
# Dry run with fixture post
pnpm --filter ingest eval-fixture fixtures/post-en-video.json

# Live Jetstream (needs JETSTREAM_URL)
pnpm --filter ingest run --projects config/projects/

# Stats mode: L1 drop rate per step
pnpm --filter ingest run --stats
```

---

## Open questions for you

1. **Node on your dev machine** — this workspace has no Node in PATH. Do you have Node elsewhere, or should we add install steps to README?

2. **Jetstream access** — do you have a Jetstream URL for dev, or should slice 1 use fixtures only until VPS?

3. **Postgres timing** — OK to defer DB to slice 2 after L1 tests pass?

4. **Config format** — JSON files on disk for projects OK until admin UI exists?

5. **Language detect** — include `franc` or similar in slice 1 for `language_unknown: detect`, or stub as `include` only for now?

---

## Success criteria for slice 1

- [x] Unit test: video project rejects non-video before keywords
- [x] Unit test: author fast-path bypasses language
- [x] Unit test: post matches 2 projects
- [x] Live run: 45s Jetstream (see below)

### Live Jetstream sample (45s, 2026-06-17)

Strict dev configs → **0% pass** on full firehose (expected).

| Metric | Value |
|--------|-------|
| Posts seen | 2,149 |
| L1 pass | 0 |
| Top drops | post_kind, author_allowlist, has_video, keyword_include, language |

---

## Slice 2 — Postgres + persistence

- [x] `docker-compose.yml` + `database/init.sql`
- [x] `storage-postgres` package — `persistL1Matches` → `ingested_posts` + `ingested_post_projects`
- [x] `@cfb/project-config` — load/save `config/projects/*.json` (UI-editable L1 surface)
- [x] List poll worker → `author_list_cache` (`@cfb/list-cache`, `apps/worker poll-lists`)
- [x] `apps/api` — projects CRUD, L1 preview, stats, list cache
- [x] Ingest daemon (`run`) hydrates lists from cache + periodic config reload

Run Postgres: `docker compose up -d postgres` (needs Docker Desktop on Windows, or Linux).
