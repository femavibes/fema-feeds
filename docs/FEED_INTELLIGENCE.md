# Feed Intelligence

Watches posts flowing through ingest and surfaces patterns that could improve feed quality — hashtags, keywords, domains, accounts you're not explicitly filtering for but that correlate strongly with your topic.

## Core Concept

Posts entering your pool carry "hitchhiker" signals — hashtags, n-grams, domains, mentions — that aren't in your config but appear disproportionately often compared to the general firehose. A high **lift** means the signal is topically relevant, not just globally popular.

```
lift = pool_frequency / firehose_frequency
```

If `#fuckcars` appears in 12% of your urbanism pool but only 0.2% of the firehose, lift = 60×. Strong suggestion. If `#photography` appears in 8% of your pool but 6% of the firehose, lift = 1.3×. Noise.

## Signal Types

| # | Type | Source on NormalizedPost | Notes |
|---|------|------------------------|-------|
| 1 | **Hashtags** | `facetTags` | Language-agnostic, no stop-word filtering needed |
| 2 | **Mentions** | `facetMentions` | Could suggest scout accounts |
| 3 | **Domains** | `facetLinks` (extract hostname) | e.g. `strongtowns.org` |
| 4 | **N-grams** | `text` + image alt-text (from embed) | Unigrams, bigrams, trigrams. Stop-word filtered. English-only v1, modular language support. |
| 5 | **Engaged accounts** | `reply.parentAuthorDid`, quoted post author | Accounts the community talks to/about |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Ingest Runner (already consuming Jetstream)        │
│                                                     │
│  ┌──────────────┐     ┌───────────────────────┐    │
│  │ Pool signal  │     │ Firehose baseline     │    │
│  │ recorder     │     │ sampler (in-memory)   │    │
│  │ (on L1 pass) │     │ (every post, 1-in-N)  │    │
│  └──────┬───────┘     └──────────┬────────────┘    │
│         │                        │                  │
│         ▼                        ▼                  │
│  ┌──────────────┐     ┌───────────────────────┐    │
│  │ Postgres     │     │ In-memory counters    │    │
│  │ pool_signals │     │ (flush hourly to DB)  │    │
│  └──────────────┘     └───────────────────────┘    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Lift Computation (periodic or on-demand)           │
│                                                     │
│  confidence = log(pool_count) * lift_ratio          │
│  Filter: already in config → exclude                │
│  Output: ranked suggestions per project             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  API → UI (Feed Intelligence panel)                 │
│  - Suggestions list with confidence scores          │
│  - Single slider: less ←→ more suggestions          │
│  - One-click "add to feed"                          │
└─────────────────────────────────────────────────────┘
```

## Scope Levels

Signals are recorded at two levels:

| Level | Key format | Source | Quality |
|-------|-----------|--------|--------|
| **Project (pool)** | `projectId` | Posts entering L1 pool | Broader, noisier |
| **Feed** | `feed:feedId` | Posts matching L2 rules | Focused, higher quality |

The UI can query either level via `?feedId=xxx` on the suggestions endpoint. Feed-level suggestions are more precise because L2 already filtered out irrelevant posts.

## Toggle Controls

- **Global**: `IntelligenceConfig.enabled` — master switch, disables all sampling/recording
- **Per-project**: `disabledProjects[]` — skip pool recording for specific projects
- Both persist in `cfb_settings` table and are loaded on ingest start
- API: `GET/PATCH /api/settings/intelligence`

## Storage

### Pool signals (Postgres — must persist across restarts)

```sql
CREATE TABLE pool_signals (
  project_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,  -- 'hashtag' | 'mention' | 'domain' | 'ngram' | 'engaged_account'
  value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,  -- start of the rolling window bucket (daily)
  PRIMARY KEY (project_id, signal_type, value, window_start)
);

CREATE INDEX idx_pool_signals_project_window
  ON pool_signals (project_id, window_start);
```

### Firehose baseline (Postgres — periodic flush from in-memory)

```sql
CREATE TABLE firehose_baseline (
  signal_type TEXT NOT NULL,
  value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  sample_size INTEGER NOT NULL,  -- total posts sampled in this window
  window_start TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (signal_type, value, window_start)
);
```

### Retention

- Rolling 7-day window. Rows older than 7 days pruned on flush.
- Pool signals: one row per (project, type, value, day). A busy feed ≈ 2–5k distinct signals/day → ~35k rows max per project.
- Firehose baseline: top 10k signals per type per day. Bounded.

## Firehose Sampling Strategy

**Hybrid in-memory + periodic flush:**

1. Every post flowing through Jetstream (before L1 eval), sample 1-in-N (configurable, default N=100).
2. Extract signals → increment in-memory `Map<string, number>` counters.
3. Every hour, flush top-K counters to `firehose_baseline` table, reset maps.
4. On graceful shutdown, flush remaining counters.
5. On startup, load last window from DB to warm the baseline.

This means:
- Zero DB writes 99.99% of the time (just map increments)
- One batch INSERT per hour
- Survives restarts (last flush is in DB)
- Configurable sample rate via UI/env

## N-gram Extraction

### Stop Words

- One file per language: `packages/feed-intelligence/src/stop-words/en.ts`
- Modular — add `es.ts`, `de.ts`, `fr.ts` etc. later
- A unigram is discarded if it's a stop word
- A bigram/trigram is discarded if ALL constituent words are stop words
- Additional filtering: discard n-grams shorter than 3 chars, pure numbers, URLs

### Text Pipeline

```
post.text + alt_text → lowercase → strip URLs → strip mentions → tokenize on whitespace/punctuation → remove stop words for unigrams → generate bigrams/trigrams from full token list (keeping meaningful words)
```

### Language Toggle

- UI: language selector (English only for v1, greyed-out options for future)
- Stop-word file loaded based on selected language
- Hashtags/domains/mentions/engaged accounts are language-agnostic (no stop-word filtering)

## Confidence Score & UI Slider

Single confidence metric combining frequency and lift:

```
confidence = log2(pool_count + 1) * lift_ratio
```

- `pool_count` ensures signals seen only once don't surface (log2(2) = 1, so a signal seen once with 50× lift = 50, but seen 16 times with 5× lift = 25 — both reasonable)
- UI exposes one slider: "Sensitivity" from Low (high confidence threshold) to High (show more speculative suggestions)
- Internally maps to a `minConfidence` cutoff
- Power users can expand to see raw pool_count + lift values per suggestion

### Configurable thresholds (defaults)

| Param | Default | Meaning |
|-------|---------|---------|
| `minPoolCount` | 5 | Signal must appear 5+ times in pool |
| `minLift` | 3.0 | Signal must be 3× more frequent in pool than firehose |
| `sampleRate` | 100 | Sample 1-in-100 firehose posts |

All configurable in UI per project.

## "Already Captured" Exclusion

Before surfacing suggestions, diff against the project's current config:
- Hashtags already in `hashtagInclude` → exclude
- Keywords already in `keywordInclude.terms` → exclude
- Accounts already in scout DIDs or author lists → exclude
- Domains already matched by existing URL filters → exclude

Read from project JSON at render time (always fresh).

## Package Structure

```
packages/
  feed-intelligence/
    src/
      index.ts              -- public API
      extract.ts            -- signal extraction from NormalizedPost
      ngrams.ts             -- tokenize + bigram/trigram generation
      stop-words/
        en.ts               -- English stop words
        index.ts            -- language registry
      counters.ts           -- in-memory counter maps
      storage.ts            -- Postgres read/write (pool_signals, firehose_baseline)
      compute.ts            -- lift calculation + suggestion ranking
      types.ts              -- SignalType, Suggestion, etc.
    package.json
    tsconfig.json
```

## Integration Points

### Ingest Runner (`packages/ingest-runner/src/runner.ts`)

Two hooks in `handlePost`:

1. **Pool recording** (after L1 pass, when `matched.length > 0`):
   ```ts
   feedIntelligence.recordPoolSignals(resolved, matchedProjectIds)
   ```

2. **Firehose sampling** (before L1 eval, every post):
   ```ts
   feedIntelligence.maybeSampleFirehose(resolved)
   ```

Both are non-blocking (fire-and-forget, in-memory ops).

### API

```
GET /api/projects/:projectId/suggestions?minConfidence=N
  → { suggestions: Suggestion[], meta: { poolPostsAnalyzed, firehoseSampled, windowDays } }

POST /api/projects/:projectId/suggestions/:id/dismiss
  → mark suggestion as dismissed (don't show again)

POST /api/projects/:projectId/suggestions/:id/accept
  → add signal to project config (hashtag/keyword/scout/etc)
```

### UI

Location: Feed workspace nav, under Overview or as "Feed Intelligence" tab.

Components:
- Sensitivity slider
- Language toggle (English only v1)
- Suggestion cards grouped by signal type
- Each card: signal value, pool count, lift ratio, "Add to feed" / "Dismiss" buttons
- Badge on nav item showing count of new suggestions above threshold

## Build Order

1. `packages/feed-intelligence/` — extraction, n-grams, stop words, types
2. Storage tables + counter logic (in-memory + flush)
3. Hook into ingest runner (pool recording + firehose sampling)
4. Lift computation
5. API endpoints
6. UI panel

## Future (v2+)

- Multi-language stop words
- Alerting/notifications ("3 new high-confidence suggestions")
- Auto-accept mode (add signals above X confidence automatically)
- Temporal trends (signal rising/falling over time)
- Cross-project intelligence (signal works well in similar feeds)
