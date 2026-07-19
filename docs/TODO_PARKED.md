# Parked work + performance switch

Parked product / product-docs work from the 2026-07 Media consolidation session. **Perf main path done** — resume product items; leftover RAM polish is optional.

---

## Parked — product (resume after perf)

### Done (don't reopen unless regression)
- [x] Consolidate Embed + Media type → **Media** multi-toggle (OR), GIF vs video, Quote vs Quote w/ media
- [x] Migrate `bool` / `media_type` on load (alpha: old feeds not required)
- [x] Canvas: `[IS]` titles, compact kind teaser, small Discover/Filter icon by lock
- [x] Filter badges for Alt text / Post age / Media stats / MIME
- [x] Mention Mode toggle (Discover/Filter) + **Discover → L1 ingest** (`facetMentions`)
- [x] Living audit started: [`docs/POST_METADATA_AUDIT.md`](./POST_METADATA_AUDIT.md)

### Parked next
- [ ] **MIME type** — decide: keep niche node / hide from palette / fold under Media advanced
- [ ] Metadata audit follow-ups from the doc:
  - [x] Unknown embeds (e.g. `app.bsky.embed.gallery`) → fix Media flags
  - [x] `postKind` consistency (quote+media → quote; real `app.bsky.feed.repost` ingest)
  - [ ] Reply / quote **target** filters (URI or author)
  - [ ] Author bio / display name as L2 match (enrichment section)
- [ ] Optional: unified node chrome (one title/badge/teaser path for all condition types)
- [ ] Expand `POST_METADATA_AUDIT.md` enrichment taxonomy (Engagement / Users / …) as needed

---

## Active — performance (CT 180, 4GB)

**Status (2026-07-18):** Main RAM blow-up fixed and deployed. Steady ~**180MB ingest** / ~**680MB CT used** after warm-up (was ~1.8GB ingest). Safe to resume parked product work; leftover items below are polish / insurance.

### Incident
- Ingest grew to ~**1.8GB**, API ~**1.5GB** (often a different cause), CT wedged → Cloudflare **524**, UI stuck on Loading / looked logged out.
- After reboot, baseline was healthy (~700MB total); ingest climbs again under full enrichment.

### Root causes (investigate order)
1. **Unbounded async firehose** — Jetstream `void onPost` / engagement handlers with no concurrency cap  
2. **Per-post labeler HTTP** (`resolveLabelerLabels`) for every post  
3. **Global engagement Jetstream** (full like/repost stream)  
4. **L2 reloads 49k DID arrays** from DB per matched post (Over5K list) instead of reusing RAM Sets  
5. Feed intelligence Maps (1h flush) / many Node processes on 4GB  

List DIDs alone are ~**10MB**, not gigabytes — they amplify DB reload churn, they aren't the heap.

### Perf TODO
- [x] Cap in-flight `handlePost` (+ engagement) with a semaphore; drop/skip when saturated  
- [x] Defer `resolveLabelerLabels` until **after L1 match** + cache labeler DID list  
- [x] Reuse hydrated author-list / ring DID Sets in L2 — process-local TTL cache + Set membership  
- [x] Follow-ring eval: don't `new Set(...)` every post  
- [x] Optional: `NODE_OPTIONS=--max-old-space-size=1536` on ingest in `dev-start.sh`  
- [ ] Cap / shorten feed-intelligence flush Maps *(polish — no feature loss)*  
- [ ] Confirm API never embeds a second live ingest runner *(insurance — API was a separate spike in the incident)*  
- [ ] Document safe 4GB footprint (which enrichment knobs are “dev only”)

### Knobs (enrichment config)
Look for `resolveLabelerLabels`, `engagementJetstream`, `trackEngagement`, `enrichAuthors` in project / runner config — toggle for relief before code ships.

---

## How to resume
1. ~~Finish perf checklist until CT stays under ~1.5–2GB steady~~ — main path done; optional polish left.  
2. Pick parked items from top of “Parked next.”
