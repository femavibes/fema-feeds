#!/bin/bash
# Stop CFB dev processes started by dev-start.sh
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

pkill -f "$ROOT/apps/api/dist/main.js" 2>/dev/null || true
pkill -f "node apps/api/dist/main.js" 2>/dev/null || true
pkill -f "$ROOT/apps/ingest/dist/main.js" 2>/dev/null || true
pkill -f "node apps/ingest/dist/main.js" 2>/dev/null || true
pkill -f "$ROOT/apps/worker/dist/main.js" 2>/dev/null || true
pkill -f "node apps/worker/dist/main.js" 2>/dev/null || true
pkill -f "$ROOT/apps/web/node_modules/.bin/../vite/bin/vite.js" 2>/dev/null || true
pkill -f "pnpm --filter @cfb/web dev" 2>/dev/null || true

if command -v ss >/dev/null 2>&1; then
  port_pids=$(ss -tlnp "( sport = :3000 )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
  for pid in $port_pids; do
    kill "$pid" 2>/dev/null || true
  done
fi

echo "CFB dev processes stopped."
