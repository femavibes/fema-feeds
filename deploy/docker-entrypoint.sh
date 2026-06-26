#!/bin/sh
set -e

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running database migrations..."
  node database/run-migration.mjs --all || echo "[entrypoint] Migration warning (may already be applied)"
fi

exec "$@"
