# Post Substitution System

## Problem

A reply or quote in the pool proves a *related* post is relevant — e.g. a reply matches keywords but the root post never would on its own. Substitution promotes that related post onto the feed when enough matching votes accumulate.

## Solution

**Substitute** is a feed **source ingress** (Sources tab + canvas), not a condition node in the match tree.

```
SUBSTITUTE → [logic…] → FEED
```

1. Prefilter-matched **replies/quotes** enter the project pool (L1 widens `post_kind` when substitute is enabled).
2. Votes accumulate internally per feed, direction, and target URI.
3. When threshold N is met, the **target post** is fetched (if missing), persisted to the pool, and evaluated on the **SUBSTITUTE path only**.
4. Promoted posts must pass whatever logic you wired after SUBSTITUTE (keywords, language, labels, etc.) — same as START and SCOUT.

There is **no `skipDiscovery`**. Substitution votes decide *which* post to promote; canvas wiring decides *whether* it lands on the feed.

---

## Substitution directions

| Direction | Vote source | Promoted post |
|-----------|-------------|---------------|
| `reply_to_root` | Reply in pool | Root post |
| `reply_to_parent` | Reply in pool | Parent post |
| `quote_to_quoted` | Quote in pool | Quoted post |
| `quoted_to_quoters` | N quotes of a pool post | Each quoter’s quote post |
| `replied_to_repliers` | N replies to a pool post | Each replier’s reply post |

Configure one or more pathways on the **Sources** tab (+ Substitute). Each pathway has direction, threshold N, and recency window (hours; 0 = no expiry).

---

## Config location

| Where | What |
|-------|------|
| **Sources tab** | Enable substitute, add pathways (direction / threshold / window) |
| **Canvas** | Drag **SUBSTITUTE** ingress → wire gates → **FEED** |

Legacy **Substitute condition nodes** in the match tree are deprecated — remove them and use Sources + canvas ingress.

---

## Vote intake (internal)

Votes are recorded at ingest when a pool post matches the direction:

- Forward directions (`reply_to_root`, etc.): reply/quote URI votes toward resolved target URI.
- Inverse directions (`quoted_to_quoters`, `replied_to_repliers`): incoming quote/reply votes toward the referenced pool post URI; when threshold met, the **quote/reply post itself** enters via SUBSTITUTE.

Vote intake does **not** run canvas logic. Replies used only as votes do not appear on the feed via START unless they also match the START path separately.

---

## Evaluation pipeline

When threshold is met:

1. Resolve target post (pool row or `app.bsky.feed.getPostThread`)
2. Normalize via `@cfb/post-normalize`
3. Persist to pool via `persistL1Matches`
4. `processPostForFeeds(..., { ingress: 'substitute', substituteDirection })` — evaluates **SUBSTITUTE → … → FEED** paths only
5. On match → upsert `feed_candidates` with `matched_via = 'substitute'` and `substitute_direction`

Example wiring:

```
SUBSTITUTE → language → labels → FEED
```

To require keywords on promoted roots, add a keyword node on the substitute path — not on the vote source.

---

## L1 / prefilter

When a feed has `sources.substitute` enabled:

1. Strict L1 compilation widens `post_kind` so replies/quotes can enter the pool for voting.
2. START-path `post_kind: root` still blocks replies from the **START** ingress at L2.

---

## Retroactive processing

On **Update Live** / pool reeval, existing replies in the pool are processed for substitution votes and ready targets are promoted — same SUBSTITUTE path eval as live ingest. No need to wait for new Jetstream events.

---

## Storage

### `substitution_votes`

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
```

Pathway IDs are derived from config: `substitute-{direction}-{index}`.

---

## Threshold & recency

```
votes = COUNT(*) FROM substitution_votes
  WHERE project_id = ? AND feed_id = ? AND pathway_id = ? AND target_uri = ?
  AND (time_window_hours = 0 OR created_at > NOW() - interval)

IF votes >= threshold THEN promote target
```

---

## Scout vs substitute

| | **Substitute** | **Scout** |
|---|----------------|-----------|
| Signal | Replies/quotes in **your pool** | Scouts like/repost **external** posts |
| Promotes | Related post (root, quoted, etc.) | The post scouts engaged with |
| Retroactive | Yes (reeval scans pool votes) | No (live engagement stream only) |

---

## Edge cases

| Case | Behavior |
|------|----------|
| Target already on feed via START | Deduplicated — candidate upsert updates score |
| Target deleted on network | Fetch fails → skip |
| Same target, multiple pathways | Independent thresholds per pathway |
| Target already promoted | Idempotent |
| Recency window expires votes | Old votes don’t count; need fresh matches |
| Pool post, substitute path fails gates | Not on feed (`matched_via` not written) |

---

## Stats & attribution

- `feed_candidates.matched_via = 'substitute'`
- `feed_candidates.substitute_direction` = direction that promoted the post
- Match pool UI: breakdown by ingress (planned)

---

## Related docs

- [FEED_SOURCES_PLAN.md](./FEED_SOURCES_PLAN.md) — unified ingress model
- [SCOUT_DISCOVERY.md](./SCOUT_DISCOVERY.md) — scout discovery (complementary)
