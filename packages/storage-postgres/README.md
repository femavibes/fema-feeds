# @cfb/storage-postgres

Postgres persistence for the ingested post pool.

- `ingested_posts` — one row per post (deduped by URI)
- `ingested_post_projects` — project tags for L1 passes

Requires `DATABASE_URL` (see root `.env.example`).
