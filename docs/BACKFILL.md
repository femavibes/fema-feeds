# Backfill System Design

> **Status:** Draft v0.1  
> **Last updated:** 2025-01-20

---

## 1. Problem

When a user creates a new project and feed, the pool starts empty. Posts only arrive via the live Jetstream firehose going forward. A feed may take hours or days to accumulate meaningful content — especially for niche topics.

**Backfill** lets users retroactively populate their project pool with historical posts that match their L1 prefilter, so feeds have content immediately.

---

## 2. Architecture — Same Pipeline, Different Sources

All backfill methods feed into the existing pipeline:

```
Backfill Source (replay | search | author crawl)
    │
    ▼
┌──────────────────────────────────────┐
│ NORMALIZE (same NormalizedPost)       │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│ L1 PREFILTER (project)               │
└──────────────────┬───────────────────┘
                   │
              fail → discard
                   │
              pass ▼
┌──────────────────────────────────────┐
│ PERSIST to pool + project tags       │
│ matched_via: backfill:{method}       │
└──────────────────┬───────────────────┘
                   ▼
┌──────────────────────────────────────┐
│ L2 EVAL (all feeds in project)       │
└──────────────────────────────────────┘
```

Posts are deduplicated by URI — if a post is already in the pool, it's skipped (or re-tagged with the project if missing the association).

---

## 3. Backfill Methods

### 3.1 Jetstream Cursor Replay

**Reach:** ~72 hours back (Jetstream server retention)

**How it works:**
- Connect to Jetstream with a `cursor` parameter (microsecond Unix timestamp)
- Replay all `app.bsky.feed.post` create events from that point forward
- Run each through the project's L1 prefilter
- Stop when cursor catches up to present (or limit reached)

**Best for:** Broad projects that match a decent % of the firehose. Gets you the last few days of content quickly.

**Limitations:** Max ~72h. High volume — replays the entire firehose for that window, so L1 rejection rate will be high for niche projects.

**Presets:**
| Preset | Cursor offset | Approx posts scanned |
|--------|--------------|---------------------|
| Last 6 hours | 6h | ~2–4M |
| Last 24 hours | 24h | ~8–15M |
| Last 72 hours | 72h | ~25–45M |

### 3.2 Bluesky Search API

**Reach:** Weeks to months (Bluesky search index depth)

**How it works:**
- Derive search queries from the project/feed configuration:
  - L1 `keyword_include` terms → search queries
  - L1 `hashtag_include` → `#tag` queries
  - L2 feed match keywords/hashtags (if user opts in)
  - User can also provide custom search terms
- Call `app.bsky.feed.searchPosts` with pagination
- Normalize results → L1 prefilter → pool → L2

**Query derivation strategy:**
1. **Auto-derive** from L1 keywords/hashtags as default suggestions
2. **User can edit/add** custom queries before running
3. Multiple queries run in sequence, results deduplicated

**Best for:** Keyword-heavy or hashtag-heavy feeds. Targeted — only fetches relevant candidates.

**Limitations:** Rate-limited by Bluesky API. Search index may not cover all posts. Language/embed filters applied post-fetch via L1.

**API details:**
- Endpoint: `app.bsky.feed.searchPosts`
- Params: `q` (query), `limit` (max 100 per page), `cursor` (pagination), `since`/`until` (date range)
- Rate limit: ~30 req/min (unauthed), higher with auth

### 3.3 Author Feed Crawl

**Reach:** Months to years (full author history)

**How it works:**
- Identify authors from the project's author lists (L1 allowlist, L2 feed author lists)
- For each author, paginate through `app.bsky.feed.getAuthorFeed`
- Normalize each post → L1 prefilter → pool → L2

**Best for:** List-based projects/feeds where you want historical content from specific people.

**Author source resolution:**
1. Project-level L1 author allowlists
2. Feed-level L2 author lists
3. User can select which lists to crawl (not all lists may be relevant)

**Limitations:** Rate-limited. Slow for large author lists. Many posts per author may not pass L1/L2.

**API details:**
- Endpoint: `app.bsky.feed.getAuthorFeed`
- Params: `actor` (DID/handle), `limit` (max 100), `cursor`, `filter` (posts_with_replies, posts_no_replies, posts_with_media, posts_and_author_threads)
- Rate limit: ~30 req/min

---

## 4. Limits & Quotas

Backfill can be expensive (API calls, CPU for L1 eval, DB writes). A two-tier limit system prevents abuse in multi-user deployments.

### 4.1 Master Limits (deployment-wide)

Set by the master account in **Settings → Backfill**. These are hard ceilings no user can exceed.

| Setting | Description | Default |
|---------|-------------|---------|
| `maxCandidatesPerRun` | Max posts scanned per backfill run | 50,000 |
| `maxMatchesPerRun` | Max posts actually saved per run (whichever limit hits first) | 5,000 |
| `maxConcurrentBackfills` | How many backfill jobs can run simultaneously | 1 |
| `cooldownMinutes` | Minimum wait between backfill runs (per project) | 15 |
| `enabledMethods` | Which methods are available (`jetstream`, `search`, `author`) | all |
| `jetstream.maxHoursBack` | Max replay window for Jetstream method | 72 |
| `search.maxPages` | Max pagination pages for search method | 50 |
| `author.maxAuthors` | Max authors to crawl per run | 100 |
| `author.maxPagesPerAuthor` | Max pages per author | 20 |

### 4.2 User Limits (per-run)

Users configure these when launching a backfill. Must be ≤ master limits.

| Setting | Description |
|---------|-------------|
| `candidateLimit` | Stop after scanning this many posts |
| `matchLimit` | Stop after saving this many matches |
| `timeRange` | How far back to go (method-dependent) |

**"Whichever comes first" logic:** A run stops when ANY limit is hit — candidates scanned, matches saved, or time range exhausted.

### 4.3 Presets

Help users understand the scale of what they're requesting:

| Preset | Candidates | Matches | Notes |
|--------|-----------|---------|-------|
| Quick taste | 5,000 | 500 | Fast, light — see if config works |
| Standard | 25,000 | 2,500 | Good starting backfill |
| Deep | 50,000 | 5,000 | Max allowed (or master limit) |
| Custom | user-set | user-set | Advanced |

---

## 5. Reconnection Resilience (Separate from Backfill)

This is automatic, not user-triggered. Fixes gaps when the app disconnects.

### 5.1 Cursor Persistence

- On each Jetstream event, periodically persist the `time_us` cursor (every ~5s or every ~1000 events)
- Store in DB: `deployment_settings.jetstream_cursor`
- On reconnect, pass `cursor` param to resume from last known position
- If cursor is too old (>72h), log a warning and connect without cursor (accept the gap)

### 5.2 Gap Detection

- Track `lastEventAt` timestamp
- On reconnect, if gap > threshold (e.g. 5 min), log it to a `backfill_gaps` table
- UI can show "missed window" warnings in ingest stats
- User can manually trigger Jetstream replay for the gap period

---

## 6. Backfill Job Model

### 6.1 Job State

```typescript
interface BackfillJob {
  id: string
  projectId: string
  method: 'jetstream' | 'search' | 'author'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  
  // Config
  config: BackfillJobConfig
  
  // Progress
  candidatesScanned: number
  candidateLimit: number
  matchesFound: number
  matchLimit: number
  l2Written: number
  errors: number
  
  // Timing
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  
  // Method-specific progress
  cursor?: string           // pagination cursor for resume
  currentAuthor?: string    // which author is being crawled
  authorsCompleted?: number
  searchQueriesCompleted?: number
}
```

### 6.2 Job Lifecycle

```
User configures → Job queued → Runner picks up → Running (progress updates)
    → Completed | Failed | Cancelled (user abort)
```

- Only `maxConcurrentBackfills` jobs run at once
- Jobs are cancellable mid-run
- Progress is persisted so UI can poll

---

## 7. UI Design

### 7.1 Settings → Backfill (Master Only)

Master account configures deployment-wide limits:

```
┌─────────────────────────────────────────────────┐
│ Backfill Limits                                  │
├─────────────────────────────────────────────────┤
│ Max candidates per run:  [50000    ]            │
│ Max matches per run:     [5000     ]            │
│ Max concurrent jobs:     [1        ]            │
│ Cooldown (minutes):      [15       ]            │
│                                                  │
│ Enabled methods:                                 │
│   [✓] Jetstream replay (up to [72] hours)       │
│   [✓] Bluesky search (up to [50] pages)         │
│   [✓] Author crawl (up to [100] authors)        │
│                                                  │
│ Author crawl max pages per author: [20]         │
└─────────────────────────────────────────────────┘
```

### 7.2 Project → Backfill (Any User)

Accessible from the project workspace. Shows available methods and lets user configure + launch.

```
┌─────────────────────────────────────────────────┐
│ Backfill Pool                                    │
│                                                  │
│ Your pool has 142 posts. Backfill to add         │
│ historical posts matching your prefilter.        │
│                                                  │
│ ┌─────────┬──────────────┬──────────────┐       │
│ │Jetstream│ Bluesky Search│ Author Crawl │       │
│ └─────────┴──────────────┴──────────────┘       │
│                                                  │
│ [Jetstream Replay tab shown]                     │
│                                                  │
│ Replay the firehose from up to 72 hours ago.     │
│ Posts are filtered through your L1 prefilter.    │
│                                                  │
│ Time range: [Last 24 hours ▾]                   │
│                                                  │
│ Limits:                                          │
│   Stop after scanning: [25000] candidates       │
│   Stop after saving:   [2500 ] matches          │
│   (whichever comes first)                        │
│                                                  │
│ Preset: [Standard ▾]                            │
│                                                  │
│ [Start Backfill]                                 │
│                                                  │
│ ─── Recent Runs ───────────────────────────────  │
│ • 2h ago: Jetstream 24h — 12,400 scanned,       │
│   340 matched, 280 fed to feeds                  │
└─────────────────────────────────────────────────┘
```

**Search tab** additionally shows:
- Auto-derived queries from L1 keywords/hashtags
- Editable query list (add/remove)
- Date range picker (since/until)

**Author Crawl tab** additionally shows:
- List of available author lists (from project + feeds)
- Checkboxes to select which lists to crawl
- Per-author page limit

### 7.3 Progress (while running)

```
┌─────────────────────────────────────────────────┐
│ Backfill Running — Jetstream Replay              │
│                                                  │
│ ████████████░░░░░░░░  58%                       │
│                                                  │
│ Scanned:  14,500 / 25,000 candidates            │
│ Matched:     820 / 2,500 matches                │
│ Fed to feeds: 340                                │
│ Errors: 2                                        │
│ Elapsed: 3m 42s                                  │
│                                                  │
│ [Cancel]                                         │
└─────────────────────────────────────────────────┘
```

---

## 8. Database Schema

```sql
-- Master backfill settings (one row, deployment-wide)
-- Stored in deployment_settings JSON or dedicated table

-- Backfill job history
CREATE TABLE backfill_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    TEXT NOT NULL,
  owner_did     TEXT,
  method        TEXT NOT NULL,  -- 'jetstream' | 'search' | 'author'
  status        TEXT NOT NULL DEFAULT 'queued',
  
  -- Config snapshot
  config_json   JSONB NOT NULL,
  
  -- Progress
  candidates_scanned  INT NOT NULL DEFAULT 0,
  candidate_limit     INT NOT NULL,
  matches_found       INT NOT NULL DEFAULT 0,
  match_limit         INT NOT NULL,
  l2_written          INT NOT NULL DEFAULT 0,
  errors              INT NOT NULL DEFAULT 0,
  
  -- Resume state
  cursor_state  JSONB,  -- method-specific cursor for resume/progress
  
  -- Timing
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  
  -- Result summary
  result_json   JSONB
);

CREATE INDEX idx_backfill_jobs_project ON backfill_jobs(project_id, created_at DESC);
CREATE INDEX idx_backfill_jobs_status ON backfill_jobs(status) WHERE status IN ('queued', 'running');

-- Jetstream cursor persistence (reconnection resilience)
-- Stored in deployment_settings: jetstream_last_cursor_us BIGINT
```

---

## 9. `matched_via` Tags

Backfilled posts get distinct tags for stats/debugging:

| Tag | Meaning |
|-----|---------|
| `backfill:jetstream` | Came from Jetstream cursor replay |
| `backfill:search` | Came from Bluesky search API |
| `backfill:author` | Came from author feed crawl |
| `jetstream` | Normal live ingest (existing) |
| `author` | Author allowlist fast-path (existing) |

---

## 10. Implementation Order

### Phase 1: Reconnection Resilience
- Persist Jetstream cursor periodically
- Resume from cursor on reconnect
- Gap detection + logging

### Phase 2: Jetstream Replay Backfill
- Backfill job model + DB table
- Jetstream replay runner (connect with cursor, run through L1, stop at limit)
- Settings tab (master limits)
- Project backfill UI (Jetstream tab only)
- Progress polling

### Phase 3: Search API Backfill
- Search query derivation from L1/L2 config
- Search runner with pagination + rate limiting
- Search tab in backfill UI

### Phase 4: Author Crawl Backfill
- Author list resolution from project/feed config
- Author feed crawler with pagination + rate limiting
- Author tab in backfill UI

---

## 11. Rate Limiting & Safety

- **Jetstream replay:** No external rate limit (it's our own connection), but CPU-bound. Limit by `maxCandidatesPerRun`.
- **Search API:** Respect Bluesky rate limits. Add delay between pages (~2s). Retry on 429 with backoff.
- **Author crawl:** Same rate limits as search. Stagger author requests. ~2s between pages.
- **Concurrent jobs:** Only `maxConcurrentBackfills` running at once. Others queue.
- **Cooldown:** Per-project cooldown prevents spam-clicking.
- **Live ingest interaction:** Backfill jobs should NOT run while live ingest is active for Jetstream method (they'd compete for the connection). Search and author crawl can run alongside live ingest.

---

## 12. Open Questions

1. **Jetstream + live ingest conflict:** Jetstream replay requires its own connection (different cursor). Should we use a second connection, or require ingest to be stopped? (Leaning: second connection is fine — Jetstream servers handle multiple subscribers.)
2. **Backfill dedup with live:** If live ingest is running and backfill is replaying recent history, posts may arrive from both. Dedup by URI handles this, but should we skip the overlap window?
3. **Search query UX:** Should auto-derived queries be shown as suggestions the user confirms, or run automatically with an "edit queries" option?
4. **Resume on failure:** If a backfill job fails mid-run, should it be resumable from the last cursor? (Leaning: yes, store cursor state.)
