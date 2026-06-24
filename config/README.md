# Project configuration (L1)

Each **project** is one JSON file in `projects/`:

```
config/projects/{projectId}.json
```

The filename comes from **`projectId`** inside the file (a stable slug), **not** from `name` (the human label shown in the UI). When you create a project in the UI, you pick `projectId` once — e.g. `urbanism`, `springfield-news` — and that becomes the filename.

| Field in JSON | Purpose |
|---------------|---------|
| `projectId` | Slug + filename (`urbanism.json`) |
| `name` | Display label only (`"Urbanism"`) |

Example: `projects/urbanism.json` with `"projectId": "urbanism"`, `"name": "Urbanism"`.

| Concern | Where it lives |
|---------|----------------|
| L1 filters per project | `config/projects/*.json` |
| Ingested posts (pool) | Postgres `ingested_posts` |
| Which projects matched a post | Postgres `ingested_post_projects` |

## Editing today

Edit JSON by hand, or use the ingest CLI (reloads on each run).

## Editing with the UI (later)

The API should **read/write these same files** via `@cfb/project-config` (`loadAllProjects`, `saveProject`). No duplicate config in the DB for v1 — Postgres holds posts, not L1 rules.
