# Custom Feed Builder

Self-hostable Bluesky custom feed platform. See [`docs/PLAN.md`](docs/PLAN.md).

## Docs

| Doc | Purpose |
|-----|---------|
| [PLAN.md](docs/PLAN.md) | Product & architecture plan |
| [MARKETPLACE_ECOSYSTEM.md](docs/MARKETPLACE_ECOSYSTEM.md) | **Marketplace, logic blocks, plugins, standard formats** |
| [MARKETPLACE_MEDIA.md](docs/MARKETPLACE_MEDIA.md) | Marketplace media uploads, gallery, product pages |
| [COMMUNITY.md](docs/COMMUNITY.md) | Community feeds, avatars, global sync |
| [MODULARITY.md](docs/MODULARITY.md) | Package boundaries & code rules |
| [RATINGS.md](docs/RATINGS.md) | Review/rating system design |
| [BUILD_INGEST_L1.md](docs/BUILD_INGEST_L1.md) | Current build slice: ingest + L1 |
| [REFERENCE_AUDIT.md](docs/REFERENCE_AUDIT.md) | What to borrow from prior repos |
| [ENGAGEMENT_REFRESH.md](docs/ENGAGEMENT_REFRESH.md) | Engagement data freshness & catch-up system |

## Prerequisites

- Node.js 20+ (installed via winget on Windows)
- pnpm 10+
- Docker (optional, for Postgres) — `docker compose up -d postgres`

```bash
pnpm install
pnpm test
pnpm ingest
```

## Repo layout

```
packages/
  core-types/       Shared types (no runtime deps)
  post-normalize/   Jetstream record → NormalizedPost
  l1-registry/      L1 filter interface + step order
  l1-filters/       One file per L1 filter
  l1-compile/       Project config → CompiledL1
  l1-eval/          Merged multi-project evaluation
  ingest-jetstream/ Jetstream WebSocket consumer
apps/
  ingest/           CLI entrypoint
```

## Reference code

Prior work snapshots live in `_ref/` (partial — mostly docs). Clone full repos when auditing L2 graph logic.
