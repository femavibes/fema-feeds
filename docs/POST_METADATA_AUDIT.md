# Post metadata & L2 coverage audit

Living doc: what Jetstream / ATProto posts give us, what we normalize and store, and how that maps to L2 nodes. Enrichment (engagement, profiles, etc.) is a separate section — it is **not** raw post metadata.

**Last updated:** 2026-07-18  
**Source of truth (code):** `packages/post-normalize`, `packages/core-types` (`NormalizedPost`, `l2.ts`, `rank-snapshot.ts`, `post-record.ts`), `packages/l2-eval`, `apps/web/.../palette.ts`

---

## 1. What normalize does

Jetstream delivers raw `app.bsky.feed.post` records. **`@cfb/post-normalize`** runs once per post and produces:

1. **`NormalizedPost`** — canonical fields for L1/L2 (persisted largely as `ingested_posts.summary_json`)
2. **`PostRankSnapshot`** — denormalized counts/stats for sort + some L2 nodes (`rank_snapshot` column)

Identity columns (`uri`, `cid`, `author_did`, `indexed_at`) live on the row; the rest of the useful shape is in JSON. L1/L2 filter against this shape, not the raw record, every time.

---

## 2. Example normalized posts (live samples)

Pulled from `ingested_posts` on CT 180 (2026-07-18). Trimmed for readability; real rows.

### A — Image post

```json
{
  "uri": "at://did:plc:dp4gjtpjpzlgtnkrxdjlbwbw/app.bsky.feed.post/3mqxejzvvps2f",
  "authorDid": "did:plc:dp4gjtpjpzlgtnkrxdjlbwbw",
  "indexedAt": "2026-07-18T22:59:28.991Z",
  "text": "america...GET FUCKED",
  "createdAt": "2026-07-18T22:59:26.816Z",
  "langs": ["en"],
  "postKind": "root",
  "recordType": "app.bsky.feed.post",
  "embed": {
    "hasVideo": false,
    "hasGif": false,
    "hasImage": true,
    "hasLinkCard": false,
    "hasQuote": false,
    "hasQuoteWithMedia": false,
    "hasRecord": false,
    "hasTextOnly": false
  },
  "embedDetail": {
    "$type": "app.bsky.embed.images",
    "images": [
      {
        "size": 353776,
        "mimeType": "image/jpeg",
        "aspectRatio": { "width": 761, "height": 1349 }
      }
    ]
  },
  "facetTags": [],
  "facetLinks": [],
  "facetMentions": [],
  "selfLabels": [],
  "labelerLabels": []
}
```

**Nodes that can hit this:** Media (`image`), MIME (`image/jpeg`), Media stats (size / aspect), Keyword (text), Language (`en`), Post type (`root`), Alt text (`missing` — no `alt` on the image).

### B — Video post

```json
{
  "uri": "at://did:plc:ycui62u5ewot6llahssydcjp/app.bsky.feed.post/3mqxejnzfws27",
  "text": "The Oath Doesn't Expire When the Politics Change",
  "langs": ["en"],
  "postKind": "root",
  "embed": {
    "hasVideo": true,
    "hasGif": false,
    "hasImage": false,
    "hasTextOnly": false
  },
  "embedDetail": {
    "$type": "app.bsky.embed.video",
    "video": {
      "size": 1670767,
      "mimeType": "video/mp4",
      "aspectRatio": { "width": 330, "height": 588 },
      "presentation": "default"
    }
  }
}
```

`presentation: "gif"` → `hasGif: true`, `hasVideo: false`. MIME node can require `video/mp4`.

### C — Link card + reply (same post)

```json
{
  "uri": "at://did:plc:ncva6zby5n2spqewkaps4mi4/app.bsky.feed.post/3mqxejvoavk2t",
  "text": "It's much worse than anyone realizes. …",
  "postKind": "reply",
  "reply": {
    "rootUri": "at://did:plc:y55jxy33u5y7xmyjgktqdqqk/app.bsky.feed.post/3mqvagr7fwk2o",
    "parentUri": "at://did:plc:y55jxy33u5y7xmyjgktqdqqk/app.bsky.feed.post/3mqvagr7fwk2o"
  },
  "embed": { "hasLinkCard": true, "hasTextOnly": false },
  "facetLinks": [
    "https://www.currentaffairs.org/news/the-u.s.-war-machine-is-earths-greatest-enemy"
  ],
  "embedDetail": {
    "$type": "app.bsky.embed.external",
    "external": {
      "uri": "https://www.currentaffairs.org/news/the-u.s.-war-machine-is-earths-greatest-enemy",
      "title": "The U.S. War Machine is Destroying the Planet",
      "description": "In their new documentary…",
      "thumbMimeType": "image/jpeg",
      "thumbSize": 724715
    }
  }
}
```

**Nodes:** Media (`link_card`), URL / Keyword (title+description+uri via search fields), Post type (`reply`). **No node** today for “reply to this exact URI” (only `reply` refs stored; Substitute uses related URIs in a different way).

### Quirk: unknown embed `$type`

We also saw a post with `embed.hasTextOnly: true` but `embedDetail.$type: "app.bsky.embed.gallery"` — gallery is **not** mapped into image/video flags yet. That is a coverage gap (see §5).

---

## 3. Metadata inventory → L2 coverage

### 3.1 Identity & record body

| Data | Where stored | L2 / L1 node coverage |
|------|----------------|------------------------|
| `uri`, `cid`, `authorDid` | row + summary | Author / Follow ring (DID lists); no “post URI equals” node |
| `indexedAt`, `createdAt` | row / summary | Post age |
| `text` | summary | Keyword, Regex (and legacy `text` leaf, off palette) |
| `langs` | summary | Language |
| `recordType` | summary | none (always `app.bsky.feed.post` for us) |
| `postKind` | summary | Post type — note: **`repost` never emitted** (we don’t ingest repost records as posts); **quote+media stays `root`/`reply`**, not `quote` |
| `reply.rootUri` / `parentUri` | summary | stored only; no dedicated “replying to X” node |
| `selfLabels` / `labelerLabels` | summary | Labels (scope self / labeler / all) |
| `bridgyOriginalText` / `Url` | summary | Keyword / Regex / URL field toggles only |

### 3.2 Facets & tags

| Data | Coverage |
|------|----------|
| Visible hashtags (`facetTags`) | Hashtag (merged with hidden + outline) |
| Hidden hashtags (`hiddenFacetTags`) | same merge; separate **counts** only via Engagement math / compare |
| Outline tags (`outlineTags` / `record.tags`) | Hashtag merge |
| Facet links (`facetLinks`) | URL, Keyword |
| Facet mentions (`facetMentions`) | Mention (Discover → L1 ingest gate; Filter stays L2) |
| Other facet feature types / byte ranges | ignored |

### 3.3 Embeds (`EmbedFlags` + `embedDetail`)

| Data | Coverage |
|------|----------|
| Shape flags (text / image / video / gif / link / quote / quote+media) | **Media** (Discover) |
| Exclusive Near You bucket 0–5 | legacy `media_type` / compare `media_type`; prefer Media flags |
| Image/video/thumb MIME | MIME type (niche); also inside Media stats path |
| Sizes, aspect ratios, image count | Media stats |
| Alt present / missing | Alt text |
| Alt **string content** | Keyword/Regex `image_alt` / `video_alt` fields |
| Link card title / description | Keyword/Regex search fields only |
| Quote / quoted URI | stored; no “quotes this post/author” leaf (Substitute is related but different) |
| Blob CIDs / CDN URLs | **not stored** — cannot match |
| Video playlist / captions / transcripts | **not stored** |
| Unknown `$type` (e.g. `gallery`) | `$type` may appear in detail; flags often wrong (`hasTextOnly`) |

### 3.4 Rank snapshot (still “core”, derived at normalize/persist)

| Data | Coverage |
|------|----------|
| `textLength`, tag counts, `mediaType`, `hasAltText`, `mediaStats.*` | Post age (time), Alt text, Media stats, compare fields |
| Copy of `embed` / `langs` / `postKind` / label vals | used by nodes above |

---

## 4. Enrichment & system (not post metadata)

Break these out so we do not confuse them with Jetstream post records.

### 4.1 Engagement

| Signal | Source | L2 surface |
|--------|--------|------------|
| like / repost / reply / quote / bookmark counts | AppView backfill + refresh; Jetstream bumps like/repost | Engagement math (`compare`), sort formulas |
| Audience likes/reposts (this feed’s readers) | `sendInteractions` | `audience_*` numeric fields |

### 4.2 Users / graphs

| Signal | Source | L2 surface |
|--------|--------|------------|
| Author follower / follows / posts counts | profile enrich | Engagement math only (counts) |
| Handle, display name, bio, account age, avatar | profile enrich | **no dedicated L2 leaf** |
| Author lists (manual / Bluesky list / starter pack) | list cache | Author node |
| Follow / follower rings | ring cache / viewer at serve | Follow ring |

### 4.3 Labels (enrichment side)

| Signal | Source | L2 surface |
|--------|--------|------------|
| Labeler moderation labels | label resolve / streams | Labels (`labeler` / `all`) |

### 4.4 Builder / path system

| Feature | L2 surface |
|---------|------------|
| Editor score | Score node (+ formula field currently stubbed as `0` in field lookup) |
| Scout discovery | Scout node (ingest-side discovery, L2 pass-through) |
| Substitute (related URI votes) | Substitute node |
| Groups / logic blocks | Groups, logic block refs |
| Personalization at serve | Feed settings — not an L2 leaf |

---

## 5. Gaps worth tracking

**High product interest**

- Reply/quote **target** filters (URI or author of parent / quoted post)
- Author **profile text** (bio / display name) as first-class match
- Unknown / new embed types (e.g. `gallery`) → correct Media flags
- ~~Mention **Discover → actual L1 ingest**~~ (wired: role discover compiles into ingest gate)
- `postKind` consistency for quote+media and real reposts

**Niche / maybe fold elsewhere**

- MIME as palette node (capability useful; dedicated node clutters — candidates: hide from palette, or advanced under Media)
- Hidden vs visible hashtags as separate toggles

**Intentionally not in L2 leaves**

- Personalization, injectors, sort packs, purge, custom enricher bags

---

## 6. Palette map (quick)

| Palette node | Primary backing |
|--------------|-----------------|
| Keyword / Regex | searchable text fields from normalize |
| Hashtag | facet + outline tags |
| URL | link card + facet links + Bridgy URL |
| Mention | `facetMentions` (+ resolve) |
| Language | `langs` |
| Labels | self + labeler |
| Media | `EmbedFlags` |
| Post type | `postKind` |
| Alt text | rankSnapshot `hasAltText` |
| Post age | `indexedAt` / `createdAt` |
| Media stats | `mediaStats` |
| MIME type | embed mime strings |
| Author / Follow ring | lists / graphs (enrichment) |
| Engagement math | metrics + rank fields |
| Score / Scout / Substitute | system / path |

Deprecated off-palette: `bool` (Embed), `media_type` (exclusive bucket), legacy `text`.

---

## 7. Maintenance

When adding a normalize field or L2 node:

1. Update §3 or §4 with the field and coverage cell.
2. Add a one-line note under §5 if something stays unmatched.
3. Optionally paste a new live `summary_json` sample under §2.

Re-pull examples:

```bash
# on CT 180 — inspect recent summary_json shapes
psql "$DATABASE_URL" -c "select summary_json from ingested_posts order by indexed_at desc limit 5"
```
