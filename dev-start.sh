#!/bin/bash
# Start (or rebuild+start) all CFB long-running processes for local/dev CT.
# Usage:
#   ./dev-start.sh           # start only
#   ./dev-start.sh --build   # pnpm build, then start
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(pwd)"
LOG_DIR="${LOG_DIR:-/tmp}"
BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build|-b) BUILD=1 ;;
  esac
done

stop_matching() {
  # Kill by cwd-specific command lines so we don't nuke unrelated node apps.
  pkill -f "$ROOT/apps/api/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/ingest/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/worker/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/web/node_modules/.bin/../vite/bin/vite.js" 2>/dev/null || true
  pkill -f "pnpm --filter @cfb/web dev" 2>/dev/null || true
  sleep 1
}

echo "Stopping previous CFB processes..."
stop_matching

if [[ "$BUILD" -eq 1 ]]; then
  echo "Building all packages..."
  pnpm build
fi

start_one() {
  local name="$1"
  local logfile="$2"
  shift 2
  echo "Starting $name → $logfile"
  (
    cd "$ROOT"
    setsid nohup "$@" >"$logfile" 2>&1 </dev/null &
    echo $! >"$LOG_DIR/cfb-$name.pid"
  )
}

# --- Always-on processes ---
start_one api "$LOG_DIR/cfb-api.log" \
  node "$ROOT/apps/api/dist/main.js"

start_one web "$LOG_DIR/cfb-vite.log" \
  pnpm --filter @cfb/web dev

start_one ingest "$LOG_DIR/cfb-ingest.log" \
  env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" \
  node "$ROOT/apps/ingest/dist/main.js" run-live

# Worker: poll author lists + follow rings.
# --interval=300 = wake every 5m to check due rows.
# Each list's next_poll_at uses its own pollIntervalMinutes (default 60).
start_one poll-lists "$LOG_DIR/cfb-poll-lists.log" \
  node "$ROOT/apps/worker/dist/main.js" poll-lists --interval=300

# Optional enrichment workers — safe to start; they no-op / exit if disabled.
start_one refresh-labels "$LOG_DIR/cfb-refresh-labels.log" \
  node "$ROOT/apps/worker/dist/main.js" refresh-labels --interval=300

# label-stream exits if enrichment/label stream is off — start anyway for when enabled.
start_one label-stream "$LOG_DIR/cfb-label-stream.log" \
  node "$ROOT/apps/worker/dist/main.js" label-stream || true

# Live Bluesky list membership (app.bsky.graph.listitem); audit poll remains size-based.
start_one listitem-stream "$LOG_DIR/cfb-listitem-stream.log" \
  node "$ROOT/apps/worker/dist/main.js" listitem-stream

sleep 3
echo
echo "CFB processes:"
printf '  %-16s %s\n' "api" "http://localhost:3000  (log: $LOG_DIR/cfb-api.log)"
printf '  %-16s %s\n' "web" "http://localhost:5173  (log: $LOG_DIR/cfb-vite.log)"
printf '  %-16s %s\n' "ingest" "Jetstream live        (log: $LOG_DIR/cfb-ingest.log)"
printf '  %-16s %s\n' "poll-lists" "list audit / rings    (log: $LOG_DIR/cfb-poll-lists.log)"
printf '  %-16s %s\n' "listitem-stream" "live list members     (log: $LOG_DIR/cfb-listitem-stream.log)"
printf '  %-16s %s\n' "refresh-labels" "label sweep           (log: $LOG_DIR/cfb-refresh-labels.log)"
printf '  %-16s %s\n' "label-stream" "live labels (opt)     (log: $LOG_DIR/cfb-label-stream.log)"
echo
curl -s -o /dev/null -w "api health: %{http_code}\n" http://localhost:3000/api/health || true
tail -n 3 "$LOG_DIR/cfb-poll-lists.log" 2>/dev/null || true
tail -n 3 "$LOG_DIR/cfb-listitem-stream.log" 2>/dev/null || true
