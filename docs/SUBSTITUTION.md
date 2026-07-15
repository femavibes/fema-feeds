# Post Substitution System

## Problem

A reply matches feed filters (keywords, etc.) but the feed only wants top-level posts. The reply itself proves the *thread* is relevant — the root post likely belongs on the feed but lacked enough direct context to match on its own.

## Solution

A **Substitute node** in feed pathways that:
1. Consumes matching replies/quotes as signals toward a related post (root, parent, or quoted)
2. When the matching reply count reaches threshold N, the target post is promoted into the feed
3. Promoted posts skip "discovery" rules (keywords, regex, hashtags, URLs) but still enforce "gate" rules (language, labels, excludes, author, post_kind, post_age)

## Substitution Directions

| Match hits... | Substitute with... | Use case |
|---|---|---|
| Reply | Root post | Replies prove thread is relevant |
| Reply | Parent post | One level up instead of all the way to root |
| Quote post | Quoted post | Quotes prove the quoted post is relevant |

## Node Shape (Visual Editor)

```
Substitute Node:
├── Direction: reply → root | reply → parent | quote → quoted
├── Matching replies/quotes needed: N (min 1, default 1)
└── Recency window: hours (0 = no expiry)
```

## Pathway-Aware Evaluation

**Placement matters.** The substitute node only fires for posts that pass the sibling conditions in the same pathway chain.

Example:
```
START → SUB(reply→root) → ALL(post_kind [root,quote] + keywords) → END
```

- The chain resolves to an `all` group: `[SUB, ALL_GROUP]`
- SUB's siblings = `[ALL_GROUP]`
- A reply comes in → is it a reply? yes → evaluate siblings (stripping post_kind nodes) → does reply match keywords? → if yes, record vote → promote root

**post_kind nodes are automatically stripped** from sibling evaluation since the substitute direction already implies the post kind (reply or quote). This is done recursively through nested groups.

## skipDiscovery — Promoted Post Evaluation

Promoted target posts run through normal L2 eval with `skipDiscovery: true`:

**Auto-pass (discovery nodes):**
- keyword, regex, hashtag, url, text

**Still enforced (gate nodes):**
- language, labels, author, follow_ring, mention, post_kind, post_age, media_type, mime_type, compare, bool, alt_text, media_stats, excludes

Rationale: the reply already proved topical relevance. The root post doesn't need to re-prove it, but must still pass quality/safety gates.

## Retroactive Processing

When a feed is saved with "Update Live", the background reeval automatically processes existing replies in the pool for substitution. No need to wait for new posts from Jetstream.

## Strict Gate Extension

When a feed has substitute nodes, the strict gate compilation:
1. Injects a `post_kind: ['reply']` (or `['quote']`) include path so replies/quotes pass L1
2. Widens any `post_kind` restrictBranch to include the needed kinds

This ensures replies get into the pool even when the feed's normal logic only wants root posts.

## Lifecycle

### 1. Ingest Time (or Reeval)

When a post is in the pool and the feed has substitution-enabled pathways:

1. `processSubstitution()` checks each substitute node in applicable feeds
2. For each node: is the post the right kind (reply/quote)? Does it pass sibling conditions (minus post_kind)?
3. If yes: resolve target URI from reply metadata → insert vote → check threshold
4. If threshold met: fetch target post (from pool or Bluesky API) → persist to pool → run L2 eval with `skipDiscovery: true`

### 2. Fetching Missing Posts

Target posts may not be in the pool. Resolution:
- Use `app.bsky.feed.getPostThread` with `depth=0&parentHeight=0`
- Normalize via `@cfb/post-normalize`
- Persist to pool via `persistL1Matches`

### 3. Feed Candidate Output

Promoted posts that pass gate-only L2 eval are written as feed candidates with normal sort scoring.

## Storage

### `substitution_votes` table

```sql
CREATE TABLE IF NOT EXISTS substitution_votes (
  id            SERIAL PRIMARY KEY,
  project_id    TEXT NOT NULL,
  feed_id       TEXT NOT NULL,
  pathway_id    TEXT NOT NULL,
  target_uri    TEXT NOT NULL,
  source_uri    TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_votes_target ON substitution_votes(project_id, feed_id, pathway_id, target_uri);
```

## Threshold & Recency Window

- **Threshold N**: how many matching replies/quotes must reference a target before it's promoted
- **Recency window (hours)**: if non-zero, only votes from the last N hours count. Older votes expire. With 0, votes never expire.

```
votes = COUNT(*) FROM substitution_votes
  WHERE project_id = ? AND feed_id = ? AND pathway_id = ? AND target_uri = ?
  AND (time_window_hours = 0 OR created_at > NOW() - interval)

IF votes >= threshold THEN promote target
```

## Edge Cases

| Case | Behavior |
|---|---|
| Root post already in feed via keyword match | Deduplicated — upsert updates sort score |
| Root post is deleted | Fetch fails → skip |
| Same root voted by multiple pathways | Independent thresholds per pathway |
| Vote arrives but target already promoted | No-op (idempotent) |
| Recency window expires votes | Old votes don't count; need fresh matching replies |
| Reply doesn't match keywords | No vote recorded (pathway siblings must pass) |

## Known Issues / TODO

- [x] ~~**Match Pool scanner** does not reflect substitution-promoted posts~~ — Fixed: `previewFeedPoolMatches` now queries `getSubstitutionTargets` for ready targets, runs L2 eval with `skipDiscovery`, and includes them in the match count with a `substitutedCount` field.

- [ ] **Match Pool scanner scanned/truncated display is wonky with substitution.** Current behavior:
  - The pool scan iterates up to `scanLimit` posts from the project pool (direct match discovery)
  - After the pool scan, substitution targets are *always* fetched from `getSubstitutionTargets` (regardless of scan cap) and evaluated with `skipDiscovery: true`
  - Substitution targets increment `scanned`, `matchCount`/`rejectCount`, and appear in match/reject samples
  - `truncated` only reflects whether the *pool scan* hit the cap (uses `poolScanned` not total `scanned`)
  - **Problem**: With a low scan cap (e.g. 10), you get output like "26 matched (21 via substitution) · 5 rejected · 31 scanned · stopped at 10 scan cap" — the `scanned` count (31) exceeds the scan cap (10) because substitution targets are added after. This is confusing.
  - **Problem**: Substitution targets are always fully evaluated regardless of scan cap. This means a scan of 10 posts still shows all 21+ substitution matches. The scan cap only limits direct discovery, not substitution. This may be correct behavior (substitution targets are already known/resolved) but the UX doesn't communicate this well.
  - **Possible fixes**:
    - Separate the display: "5 matched · 21 via substitution · 5 rejected · 10 pool posts scanned"
    - Or: don't include substitution targets in `scanned` — show them as a separate count entirely
    - Or: include substitution targets in `poolTotal` so the ratio makes sense
    - Key constraint: substitution targets MUST still be evaluated through full L2 (gates enforced, discovery skipped) — they are not guaranteed matches

- [ ] **`allMatchedUris` dedup fix** — Previously `matchedUris` was built from the display-capped `matches` array, causing targets that overlapped with direct matches to be double-counted when "matches to list" was lower than the direct match count. Fixed by tracking `allMatchedUris` separately from the display array. Confirmed working.

- [ ] **Stale candidates from scope changes** — `purgeOutOfScopeCandidates` now runs at the start of each rebuild (for `project_only` feeds). Deletes `feed_candidates` rows whose `post_uri` is not in `ingested_post_projects` for the feed's project. Does NOT delete from `ingested_posts` — only removes from the feed's candidate list. This handles cases where posts were added as candidates under a previous scope/config but are no longer in the feed's pool.

## Future Extensions

- **Confidence system**: votes contribute to a global confidence score rather than binary threshold
- **Reverse substitution**: top-level post promotes its best reply
- **Thread promotion**: entire thread enters feed as a unit
- **Score inheritance**: substituted post starts with average/max score of its triggering posts
