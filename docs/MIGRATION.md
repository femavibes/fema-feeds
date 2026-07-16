# Migration Guide: Windows → Proxmox Linux

## Project Overview

Custom Feed Builder — a self-hostable Bluesky custom feed platform. Monorepo with pnpm workspaces.

**Repo**: `https://github.com/femavibes/fema-feeds.git` (branch: `main`)

## Current State (Windows PC)

- Node.js 24 (20+ required)
- pnpm 10+
- PostgreSQL 17 (native, not Docker)
- No Docker for the dev/consumer deployment
- Marketplace deployment runs separately in Docker on same Windows PC
- Cloudflare tunnel (`feedbuilder.fema.monster`) points to Vite dev server (port 5173)

## Target Architecture (Proxmox)

| LXC/VM | Role | Docker? | Notes |
|--------|------|---------|-------|
| Container 1 | **Marketplace** | Yes (Docker) | Source of truth for logic blocks, sort packs, plugins. Migrated from Windows. |
| Container 2 | **Consumer** | Yes (Docker) | Production feed deployment (urbanism feed, etc). Points at marketplace. |
| Container 3 | **Development** | No | Direct `pnpm dev`. Points at marketplace for catalog reads. |

## Prerequisites (Linux LXC)

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# PostgreSQL 17
apt-get install -y postgresql-17
sudo -u postgres createuser cfb
sudo -u postgres createdb custom_feed_builder -O cfb
sudo -u postgres psql -c "ALTER USER cfb PASSWORD 'cfb_dev';"
```

## Setup Steps

```bash
git clone https://github.com/femavibes/fema-feeds.git
cd fema-feeds
pnpm install
```

## Environment Variables (.env in repo root)

```env
DATABASE_URL=postgresql://cfb:cfb_dev@localhost:5432/custom_feed_builder
JETSTREAM_URL=wss://jetstream1.us-east.bsky.network/subscribe

# Auth — needed for UI access
MASTER_DID=did:plc:lptjvw6ut224kwrj7ub3sqbe
APP_PASSWORD_LOGIN=true

# For consumer deployment pointing at marketplace:
# MARKETPLACE_REGISTRY_URL=http://<marketplace-host>:3000

# Cloudflare tunnel (if using)
# CLOUDFLARE_TUNNEL_TOKEN=<token>
# PUBLIC_URL=https://feedbuilder.fema.monster
```

## Database

Tables are auto-created on first run. No manual migration needed. Key tables:

- `ingested_posts` — all posts that pass L1 filters
- `ingested_post_projects` — post↔project associations
- `feed_candidates` — posts that pass L2 evaluation for a feed
- `pool_signals` — feed intelligence signal counts per project/feed
- `firehose_baseline` — firehose signal frequencies for lift calculation
- `intelligence_dismissed` — dismissed intelligence suggestions
- `cfb_settings` — key-value settings store

If migrating data from Windows, use `pg_dump`/`pg_restore`:
```bash
# On Windows:
"C:\Program Files\PostgreSQL\17\bin\pg_dump" -U cfb -Fc custom_feed_builder > cfb_backup.dump

# On Linux:
pg_restore -U cfb -d custom_feed_builder cfb_backup.dump
```

## Build & Run

### Development (no Docker)

```bash
# Build all packages
pnpm build

# Or individually:
pnpm --filter @cfb/core-types build
pnpm --filter @cfb/storage-postgres build
pnpm --filter @cfb/feed-intelligence build
pnpm --filter @cfb/l2-worker build
pnpm --filter @cfb/api build
pnpm --filter @cfb/web build

# Run API (port 3000)
cd apps/api && node dist/main.js

# Run Vite dev server (port 5173, hot reload)
pnpm --filter @cfb/web dev
```

### Linux rebuild script (equivalent of dev-rebuild.bat)

Create `dev-rebuild.sh`:
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Stopping processes..."
pkill -f "node dist/main.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

echo "Building all packages..."
pnpm --filter @cfb/core-types build
pnpm --filter @cfb/storage-postgres build
pnpm --filter @cfb/feed-intelligence build
pnpm --filter @cfb/l2-worker build
pnpm --filter @cfb/api build
pnpm --filter @cfb/web build

echo "Starting API (port 3000)..."
cd apps/api && node dist/main.js &

echo "Starting Vite dev server (port 5173)..."
cd ../.. && pnpm --filter @cfb/web dev &

echo "API → http://localhost:3000"
echo "Dev → http://localhost:5173"
```

## Repo Structure

```
packages/
  core-types/          Shared TypeScript types (no runtime deps)
  storage-postgres/    Database layer (pg queries)
  feed-intelligence/   Signal extraction, backfill, lift computation
  post-normalize/      Jetstream record → NormalizedPost
  l1-registry/         L1 filter interface
  l1-filters/          Individual L1 filter implementations
  l1-compile/          Project config → CompiledL1
  l2-eval/             L2 rule evaluation engine
  l2-graph/            L2 visual graph logic
  l2-worker/           L2 evaluation worker (match-pool, reeval, scout, substitution)
  ingest-jetstream/    Jetstream WebSocket consumer
  ingest-runner/       Ingest orchestration (runner, enrichment, scout, backfill)
apps/
  api/                 Hono HTTP API server (port 3000)
  web/                 React + Vite frontend
  ingest/              CLI entrypoint for standalone ingest
config/
  projects/            Project JSON configs (e.g. urbanism.json)
  feeds/               Feed JSON configs (e.g. up-test.json)
docs/                  Architecture & feature documentation
```

## Key Architectural Notes

### Package Build Order Matters
Packages export from `dist/` (compiled TypeScript). If you change a package's source, you MUST rebuild it before the API will see the changes. The build chain is:
```
core-types → storage-postgres → feed-intelligence → l2-worker → api → web
```

### Feed Intelligence System
- Extracts signals (hashtags, ngrams, domains, mentions, engaged accounts) from pool posts
- Compares against firehose baseline to compute "lift" (how distinctive a signal is)
- Backfill: samples jetstream 30s + scans existing pool posts
- Idempotent: uses DELETE+INSERT (not additive upsert) for backfill
- UI: toggle switches, info modals, profile resolution for accounts

### Auth
- Supports OAuth (Bluesky) and app-password login
- `MASTER_DID` controls who has admin access
- All API routes require auth (return `login_required` without it)

### Ingest Pipeline
```
Jetstream → L1 filters (language, keywords, hashtags, post kind) → Pool
Pool → L2 evaluation (rule graph: conditions, logic blocks) → Feed candidates
Feed candidates → Feedgen skeleton API → Bluesky
```

### Marketplace
- Registry role: hosts logic blocks, sort packs, plugins
- Consumer role: subscribes to marketplace catalog
- Set via `MARKETPLACE_REGISTRY_URL` env var
- Single source of truth — don't run two registries

## Ports

| Service | Port | Notes |
|---------|------|-------|
| API | 3000 | Hono server, serves API + static web build |
| Vite dev | 5173 | Hot reload frontend (dev only) |
| PostgreSQL | 5432 | Database |

## Tests

```bash
pnpm test          # Run all tests
pnpm --filter @cfb/feed-intelligence test
pnpm --filter @cfb/l2-eval test
```

Note: `apps/api` has 13 pre-existing test failures (auth-related 401 vs 200 mismatches). Not caused by recent changes.

## Docker (for marketplace/consumer production)

There should be a `Dockerfile` and `docker-compose.yml` in the repo root (or create them). The Docker setup needs:
- Multi-stage build (install deps → build → runtime)
- Postgres as a service (or external)
- Environment variables passed in
- Port 3000 exposed

## What's NOT in Git

- `dist/` folders (build output, gitignored)
- `node_modules/`
- `.env` files
- Database data
- `.prompts/` (local AI prompt files)
- Cloudflare tunnel tokens
