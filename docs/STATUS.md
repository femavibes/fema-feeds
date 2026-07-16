# WaffleHouseIndex (Custom Feed Builder) — project status

Last updated: July 2026

## What this is

A self-hostable visual editor for Bluesky custom feeds. L1 strict-mode ingest, graph-based L2 logic, feed publishing, marketplace for logic blocks/sort packs/plugins, and multi-user deployments backed by Postgres.

**Marketplace & extensions:** see [MARKETPLACE_ECOSYSTEM.md](./MARKETPLACE_ECOSYSTEM.md).

---

## Deployment

| Environment | Host | URL |
|-------------|------|-----|
| Dev - CT 180 | 192.168.0.180 | https://feeddev.fema.monster - Vite :5173 |
| Consumer - CT 181 | 192.168.0.181:3002 | https://feedbuilder.fema.monster |
| Marketplace - CT 181 | 192.168.0.181:3001 | https://marketplace.fema.monster |

- Docker image: `ghcr.io/femavibes/fema-feeds:latest` — auto-built on push to main
- Update production: `cd /opt/wafflehouse && docker compose pull && docker compose up -d`
- Dev rebuild: `cd /waffleindex && pnpm build`

---

## Working today

| Area | Status |
|------|--------|
| Visual L2 graph editor | ✓ Canvas is source of truth for match logic |
| Strict-mode L1 ingest | ✓ Auto-compiled from feed L2 keywords |
| Jetstream ingest + strict gate | ✓ Only pools posts matching feed keywords |
| Backfill - jetstream replay, search API, author crawl | ✓ Strict gate applied, inflight L2 awaited |
| Postgres persistence | ✓ |
| Multi-user via OAuth | ✓ Bluesky OAuth via Cloudflare tunnel |
| Feed publishing via did:web | ✓ Cloudflare tunnel recommended for home |
| Publish checklist | ✓ Not gated on candidates — can publish empty feed |
| Auto-poll publish status | ✓ 8s interval while pending |
| Logic blocks marketplace | ✓ Collection, browse, subscribe, upgrades |
| Sort packs marketplace | ✓ Apply on feed Sorting tab |
| Injector/ranker plugins | ✓ Native + remote hooks |
| Project-level Logic Blocks tab | ✓ Pin block → auto-inserted into new feeds |
| Cloudflare Tunnel deploy option | ✓ Recommended for home users |
| Tailscale Funnel deploy option | ✓ Alternative |
| Custom reverse proxy option | ✓ Advanced |

---

## Architecture

### L1 — Project Pool
- `prefilterMode: strict` — L1 gate auto-compiled from all feed L2 keyword nodes
- Strict gate deduplicates terms across feeds
- Backfill applies same strict gate as live ingest
- Pool only contains posts that match at least one feed's keywords

### L2 — Feed Candidates
- Each feed has its own visual canvas / graph editor
- Posts from L1 pool evaluated against feed's L2 rules
- Candidates = posts that pass L2, served via getFeedSkeleton
- Logic blocks: reusable rule packages shared across feeds

### Project Logic Blocks
- Pin a logic block to a project via Logic Blocks tab
- New feeds auto-start with START → pinned block → END
- Users can move/delete the block from individual feeds
- Enables "one concept, multiple presentation modes" pattern

---

## Backfill summary line

```
completedjetstream — 25,000 scanned, 6 pooled, 4 candidates
```

- **scanned** = firehose posts checked
- **pooled** = passed strict gate + L1 eval, added to project pool
- **candidates** = passed L2 eval, added to feed candidate list

---

## Key paths

| Topic | Location |
|-------|----------|
| Strict gate compile | `packages/l1-compile/src/strict-compile.ts` |
| Strict gate eval at ingest | `packages/ingest-runner/src/strict-gate.ts` |
| Backfill runner | `packages/ingest-runner/src/backfill-runner.ts` |
| L2 eval | `packages/l2-eval/src/evaluate.ts` |
| L2 graph to match | `packages/l2-graph/src/canvas-match.ts` |
| Publish checklist | `packages/feedgen/src/publish.ts` |
| Feed creation with auto-insert | `apps/web/src/lib/l2-form.ts` — emptyFeed |
| Project Logic Blocks UI | `apps/web/src/components/ProjectLogicBlocksPanel.tsx` |
| Docker entrypoint | `docker-entrypoint.sh` |
| DB migrations | `database/migrations/` |

---

## Dev environment — CT 180

```bash
cd /waffleindex
pnpm build        # builds all packages
pnpm dev          # API :3000 + Vite :5173
```

`.env` needs `DATABASE_URL=postgresql://cfb:cfb_dev@localhost:5432/custom_feed_builder`

---

## Production — CT 181

```bash
cd /opt/wafflehouse
docker compose pull && docker compose up -d
```

Two services using same image, differentiated by env vars:
- **marketplace**: `CFB_APP_PROFILE=registry`, port 3001
- **consumer**: `MARKETPLACE_REGISTRY_URL=http://marketplace:3000`, port 3002
