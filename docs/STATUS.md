# Custom Feed Builder — project status

Last updated: June 2026

## What this is

A visual editor for L2 Bluesky custom feeds: L1 match rules, graph-based logic, feed publishing settings, and multi-user deployments backed by Postgres.

**Marketplace & extensions:** see [MARKETPLACE_ECOSYSTEM.md](./MARKETPLACE_ECOSYSTEM.md).

---

## Working today

| Area | Status |
|------|--------|
| Visual L2 graph editor | ✓ Canvas is source of truth for match logic |
| Feed tabs (Setup / Rules / Publish) | ✓ |
| Jetstream ingest + L1 filtering | ✓ |
| Postgres persistence | ✓ Native Windows or Docker |
| Multi-user (when `DATABASE_URL` set) | ✓ Projects/feeds scoped per account |
| Shared global post pool | ✓ `poolScope: global` |
| **Login via app password** | ✓ Handle + Bluesky app password, works on **localhost** |
| Per-user DuckDNS (feed publishing) | ✓ Settings → Feed publishing |
| Master account + login whitelist | ✓ First login = master; master adds friend DIDs |
| Feedgen XRPC + host routing | ✓ Per-user DuckDNS / public URL |
| **Logic blocks marketplace (native)** | ✓ Collection, browse, subscribe, upgrades, local registry stub |
| **Sort packs marketplace (native)** | ✓ Same tiers; apply on feed Sorting tab |
| **Injector plugins (foundation)** | ✓ Marketplace subscribe; native/remote post-sort hook on skeleton |
| **Ranker plugins (foundation)** | ✓ Marketplace subscribe; skeleton-time reorder (pinned URIs + remote) |

---

## Paused / not yet done

| Area | Status | Notes |
|------|--------|-------|
| **Bluesky OAuth login** | **Paused — COMING SOON** | Needs a public HTTPS hostname (e.g. `feedbuilder.fema.monster`). Home server / Cloudflare tunnel was down when we last tried. Code exists; not required for dev. |
| Auto-publish generator records | Not built | Publish tab shows readiness checklist only |
| OAuth-based feed record publishing | Not built | Would use stored OAuth session |
| Cloudflare Tunnel as EZ deploy option #2 | Deferred | For home users without a VPS |
| Handle-based whitelist (not just DID) | Not built | Master pastes DIDs in Settings |
| End-user control plane (no Cloudflare token) | Scripts only | `CFB_CONTROL_PLANE_URL` flow not wired in UI |

---

## Auth model (current)

### Login (now): app password

- User enters **handle** + **app password** (from Bluesky Settings → App passwords).
- Server verifies via Bluesky `com.atproto.server.createSession`.
- App password is **not stored** — only a browser session cookie (`cfb_session`).
- Works on **http://localhost:5173** — no domain required.

### Login (later): OAuth

- Requires `OAUTH_PUBLIC_URL` (HTTPS + real hostname).
- Planned: operator provisions e.g. `https://feedbuilder.fema.monster` once per deployment.
- **Separate from DuckDNS** — OAuth is deployment-wide; DuckDNS is per-user for feed endpoints.

### Deployment roles

- **Master** — VPS operator; first login (or `CFB_MASTER_DID`). Can edit whitelist, enrichment, labelers.
- **Friends** — Must be on whitelist (`allowedDids`) to sign in. Own their projects/feeds.

---

## URL split (important)

| Purpose | Example | Who sets it |
|---------|---------|-------------|
| App login (OAuth, later) | `https://feedbuilder.fema.monster` | Deployment operator, once |
| Feed generator (publishing) | `https://myfeeds.duckdns.org` | Each user after login |

Independent deployers use their own domain or DuckDNS for OAuth — they do not need `fema.monster`.

---

## Local dev (Windows)

```powershell
# Postgres service should be running (postgresql-x64-17)
pnpm api    # :3000
pnpm web    # :5173
# or: .\scripts\restart-dev.ps1
```

Open **http://localhost:5173**, sign in with handle + app password.

`.env` needs `DATABASE_URL=postgresql://cfb:cfb_dev@localhost:5432/custom_feed_builder`.

---

## OAuth resume checklist (when home server is back)

1. Cloudflare DNS: `feedbuilder` → tunnel or VPS IP (proxied).
2. `.env`: `OAUTH_PUBLIC_URL=https://feedbuilder.fema.monster`
3. Browse the app at that URL (not localhost).
4. Re-enable OAuth button on login screen (currently marked COMING SOON).

---

## Key paths

| Topic | Location |
|-------|----------|
| App password auth | `apps/api/src/auth/app-password.ts`, `POST /api/auth/login-app-password` |
| OAuth (paused) | `apps/api/src/auth/oauth.ts`, `apps/api/src/deployment-url.ts` |
| Login UI | `apps/web/src/components/LoginScreen.tsx` |
| DuckDNS | `apps/api/src/duckdns.ts`, Settings → Feed publishing |
| DB migrations | `database/migrations/` |
