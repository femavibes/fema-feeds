# Reference Repo Audit

> Pulled from `femavibes/feed-gen` and `therichferro/ATlas-Near-You-Feed` (2026-06-17).  
> Local copies in `_ref/` for offline reading.

---

## Repos

| Repo | What it is |
|------|------------|
| **femavibes/feed-gen** | Prior custom feed builder — Jetstream ingest, visual graph editor, feed API |
| **therichferro/ATlas-Near-You-Feed** | Near You + ATlas production feed — scoring, personalization, Jetstream subscription |

`/atlas` and `/near-you` are not separate folders — they live inside ATlas-Near-You-Feed as `src/scoring/`, `src/algos/near-you*.ts`, `src/subscription.ts`, etc.

---

## feed-gen — what exists

### Services (`services/`)

| Service | Role |
|---------|------|
| `jetstream-ingestion` | Python — Jetstream WS, graph gate, writes `posts` table |
| `feed-assignment-worker` | Python — re-evaluates posts against feed graphs → `feed_posts` |
| `feed-api` | Serves feeds to Bluesky |
| `visual-editor` | React graph builder + JS evaluator mirror |

### Ingestion model (today)

```
Jetstream → graph gate (evaluate ALL feed graphs) → posts table → assignment worker → feed_posts
```

- **Graph gate** runs full visual graph logic at ingest time (`graph_match.py`)
- Only posts matching **any** feed graph enter `posts`
- Assignment worker **re-runs** the same engine on everything in `posts`
- Evaluation order by cost tier is already documented (language → posttype → embeds → text/hashtag → regex)

### What went wrong (maps to our L1/L2 design)

1. **Single-layer complexity** — ingest gate and feed assignment both run the full graph engine. No cheap project-level prefilter separate from Graze-like logic.

2. **Graph gate ≠ simple L1** — `INGESTION.md` notes graph mode must skip global keyword/language prefilters because a regex-only feed would never index. That's the smell: one pipeline trying to be both coarse gate and fine builder.

3. **Still stores too much** — every graph-matching post lands in `posts`, then assignment duplicates work. Memory/disk pressure (`memoryleak.md`, assignment churn).

4. **Three copies of evaluator** — Python ingest, Python worker, JS visual editor. Drift risk.

5. **Source nodes drafted but not the core model** — `SOURCE_NODES.md` has per-source prefilters (good idea!) but ingestion still centers on one graph gate.

### What to borrow from feed-gen

| Borrow | Location | Notes |
|--------|----------|-------|
| Jetstream worker patterns | `services/jetstream-ingestion/worker.py` | WS connection, batch commit, lang normalization |
| Cost-tier eval order | `INGESTION.md` § Evaluation order | Validates our L1 step order; extend with separate embed flags |
| Field path resolution | `INGESTION.md` § Condition nodes | Alt text, link cards, quote-with-media — reuse in L2 |
| `facet_tags` / `outline_tags` denorm | `INGESTION.md` § Tag columns | Good for keyword/hashtag without re-parsing |
| Visual graph JSON shape | `FEED_LOGIC_JSON_SCHEMA.md`, editor | **L2 only** — not at Jetstream |
| Multi-END / branching | `INGESTION.md` § Multi-END | Maps to L2 OR paths |
| Aho-Corasick keyword prefilter | `keyword_matcher.py` | Use in merged L1 keyword step |

### What NOT to port

- Full graph eval at Jetstream ingest
- Dual assignment pass on same rules
- Python + JS dual engine (pick TS, one compiler, one runtime)
- Storing all graph-matching posts without project-level TTL discipline

---

## ATlas-Near-You-Feed — what exists

### Key modules

| Module | Role |
|--------|------|
| `src/subscription.ts` | Jetstream via `@skyware/jetstream`, batch inserts, interest tagging |
| `src/scoring/engine.ts` | Factor-based scoring pipeline |
| `src/scoring/factors.ts` | Individual score factors |
| `src/scoring/local-relevance.ts` | Geo/local relevance |
| `src/scoring/diversity.ts` | Diversity mixer |
| `src/scoring/regional-mixer.ts` | Regional post mixing |
| `src/algos/near-you.ts` | Feed algorithm assembly |
| `src/feed-config.ts` | Config loader |
| `src/interest-compute.ts` | Interest term matching |

### What to borrow from ATlas

| Borrow | Location | Phase |
|--------|----------|-------|
| Jetstream client setup | `subscription.ts` | Phase 0 |
| Normalized post shape / batch flush | `subscription.ts` | Phase 0 |
| Scoring factor interface | `scoring/engine.ts` | Phase 5 |
| Freshness decay, engagement weights | `scoring/factors.ts` | Phase 5 |
| Diversity / regional mixer patterns | `scoring/diversity.ts`, `regional-mixer.ts` | Phase 5+ |
| Config-driven weights | `feed-config.ts` | Phase 5 |

### What NOT to port (v1)

- ATlas/skymap dual-database layout
- City/region labeling pipeline (unless plugin later)
- Viewer-personalized skeleton (Near You is per-user; we default global skeleton first)
- 23+ admin settings surface — start minimal

---

## How reference maps to our architecture

```
feed-gen lesson:          Don't run the visual graph at Jetstream.
our fix:                  L1 = fixed-order cheap filters (per project, merged)
                          L2 = feed-gen graph engine (on ingested pool only)

feed-gen asset:           Field paths, tag denorm, eval cost tiers, Jetstream worker
atlas asset:              Scoring engine, Jetstream TS client, algo composition
```

---

## Next audit steps

- [ ] Read `jetstream-ingestion/worker.py` + `graph_match.py` in full
- [ ] Read `feed-assignment-worker/engine.py` — extract L2 node types list
- [ ] Compare `scoring/factors.ts` to our rank profile schema
- [ ] Read `FEED_LOGIC_JSON_SCHEMA.md` for L2 JSON compatibility decision
