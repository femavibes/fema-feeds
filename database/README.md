# Database setup

PostgreSQL for Custom Feed Builder. **Docker is optional** — use native Postgres on Windows when virtualization is unavailable.

---

## Option A: Docker (Linux home server, or Windows with VT-x enabled)

```bash
docker compose up -d postgres
```

Requires: BIOS virtualization ON, Docker Desktop running.

---

## Option B: Native PostgreSQL on Windows (no Docker)

Use this when you see:

> *Virtualization support not detected*

### 1. Install

```powershell
winget install PostgreSQL.PostgreSQL.17 --accept-package-agreements
```

During install, note the **postgres superuser password** you set.

Default port: **5432**. Bin path (typical):

```
C:\Program Files\PostgreSQL\17\bin
```

### 2. Create app database

If you do not know the installer password, run **as Administrator**:

```powershell
.\database\setup-admin.ps1
```

That temporarily trusts localhost, sets the `postgres` password to `cfb_dev`, creates the app DB, then restores normal auth.

If you already know the postgres password:

```powershell
$env:POSTGRES_PASSWORD = 'your-installer-password'
.\database\setup-windows.ps1
```

Or manually with psql if you prefer.

### 3. Connection string

```
postgresql://cfb:cfb_dev@localhost:5432/custom_feed_builder
```

Copy to `.env` as `DATABASE_URL` (see `.env.example`).

When `DATABASE_URL` is set, `run-live` persists L1 passes via `@cfb/storage-postgres`.

---

## Option C: Skip Postgres for now

Ingest + L1 still work without a database (console stats only). Omit `DATABASE_URL`.

---

## Enable virtualization (if you want Docker later)

1. Reboot → enter BIOS/UEFI (often Del, F2, or F10 at boot)
2. Enable **Intel VT-x** / **AMD-V** / **SVM Mode**
3. In Windows: **Optional Features** → enable **Virtual Machine Platform** + **Windows Subsystem for Linux**
4. Reboot, start Docker Desktop again

Some corporate PCs lock this — native Postgres (Option B) or Linux server is the workaround.

---

## Linux (home server)

```bash
docker compose up -d postgres
# or: apt install postgresql && run init.sql
```

---

## Schema

`database/init.sql` — tables: `ingested_posts`, `ingested_post_projects`, `author_list_cache`, `feed_candidates`, `labeler_sources`

### Migrations (existing databases)

Native Postgres — no Docker required:

```powershell
node database/run-migration.mjs --all
```

The script reads `DATABASE_URL` from `.env` and automatically retries as the `postgres` superuser (password from `POSTGRES_PASSWORD` or `cfb_dev` on dev setups).

Optional: set `MIGRATION_DATABASE_URL` for a custom superuser connection.

Per-file:

```powershell
node database/run-migration.mjs database/migrations/002_ownership.sql
```

### Label watch worker

Labelers often apply moderation labels minutes after a post is created. Run periodically:

```powershell
pnpm --filter @cfb/worker run refresh-labels
# or loop every 5 minutes:
node apps/worker/dist/main.js refresh-labels --interval=300
```
