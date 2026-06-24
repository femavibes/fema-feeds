# Build slice: L2 feed logic

> **Status:** v0 — rule tree + math expressions + UI  
> **Runs on:** posts already in the L1 pool (`ingested_posts` + project tags)

## vs Graze

| | Graze | Us (L2 v0) |
|---|-------|------------|
| Logic | OR groups of AND conditions | Same: `any` / `all` / `none` groups |
| Fields | text, counts, embeds, lists | text, hashtags, embed flags, math |
| Math | Flat compares only | **Expression trees** (`+`, `-`, `*`, `/`) |
| Scope | Full firehose DB | **Project pool only** (or global pool opt-in) |

## Rule tree

```json
{
  "type": "group",
  "id": "root",
  "logic": "any",
  "children": [
    {
      "type": "group",
      "logic": "all",
      "children": [
        { "type": "text", "op": "contains", "value": "transit" }
      ]
    }
  ]
}
```

### Node types (v0)

- **group** — `all` (AND), `any` (OR), `none` (NOT any)
- **text** — contains / not_contains / equals / regex
- **hashtag** — includes / excludes
- **bool** — embed flags (`has_video`, …)
- **compare** — `(expr) >= (expr)` with arithmetic
- **author** — in_list / not_in_list (API preview hydrates list DIDs)

### Math example

```json
{
  "type": "compare",
  "left": {
    "type": "binary",
    "op": "+",
    "left": { "type": "field", "field": "like_count" },
    "right": { "type": "field", "field": "repost_count" }
  },
  "op": ">=",
  "right": { "type": "literal", "value": 25 }
}
```

Engagement fields default to **0** until we hydrate metrics from the PDS (next slice).

## Packages

- `@cfb/core-types` — `FeedConfig`, `L2RuleNode`, `L2Expr`
- `@cfb/l2-eval` — `evaluateFeedL2(post, feed, input)`
- `@cfb/feed-config` — `config/feeds/{feedId}.json`

## API

- `GET /api/projects/:projectId/feeds`
- `POST /api/feeds` · `GET/PUT/DELETE /api/feeds/:id`
- `POST /api/feeds/:id/preview` — post URL + optional test metrics

## UI

Project → **L2 feeds** tab. Small form-based tree editor (not a heavy canvas). Files under `apps/web/src/components/l2/`.

## Not in v0 yet

- [ ] L2 worker: pool → `feed_candidates` on ingest / batch
- [ ] Live engagement hydration for math
- [ ] Visual graph canvas (optional later)
- [ ] `getFeedSkeleton` reading candidates
