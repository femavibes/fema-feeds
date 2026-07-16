#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Stopping processes..."
pkill -f "node dist/main.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 1

echo "Building all packages..."
pnpm build

echo "Starting API (port 3000)..."
cd apps/api && node dist/main.js &

echo "Starting Vite dev server (port 5173)..."
cd ../.. && pnpm --filter @cfb/web dev &

echo "API → http://localhost:3000"
echo "Dev → http://localhost:5173"
wait
