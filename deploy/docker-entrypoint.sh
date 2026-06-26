#!/bin/sh
set -e

# Ensure config directories exist (empty Docker volume on first run)
mkdir -p /app/config/projects /app/config/feeds

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Applying base schema..."
  node database/init-schema.mjs
  echo "[entrypoint] Running migrations..."
  node database/run-migration.mjs --all || echo "[entrypoint] Migrations note: some may already be applied"
fi

exec "$@"
