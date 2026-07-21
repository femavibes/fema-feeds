#!/bin/bash
# Start (or rebuild+start) all CFB long-running processes for local/dev CT.
# Usage:
#   ./dev-start.sh           # start only
#   ./dev-start.sh --build   # pnpm build, then start
#
# Ingest is NOT started here — control it from the web UI (API-embedded runner).
# Starting a standalone apps/ingest process duplicates Jetstream and ignores UI Stop.
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
  # Match both absolute and relative argv forms (older starts used `node apps/api/...`).
  pkill -f "$ROOT/apps/api/dist/main.js" 2>/dev/null || true
  pkill -f "node apps/api/dist/main.js" 2>/dev/null || true
  # Always kill stray standalone ingest (legacy / accidental) — UI owns ingest now.
  pkill -f "$ROOT/apps/ingest/dist/main.js" 2>/dev/null || true
  pkill -f "node apps/ingest/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/worker/dist/main.js" 2>/dev/null || true
  pkill -f "node apps/worker/dist/main.js" 2>/dev/null || true
  pkill -f "$ROOT/apps/web/node_modules/.bin/../vite/bin/vite.js" 2>/dev/null || true
  pkill -f "pnpm --filter @cfb/web dev" 2>/dev/null || true
  # If a stale api still holds :3000, force it down so restart cannot EADDRINUSE.
  if command -v ss >/dev/null 2>&1; then
    local port_pids
    port_pids=$(ss -tlnp "( sport = :3000 )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)
    for pid in $port_pids; do
      kill "$pid" 2>/dev/null || true
    done
  fi
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
# Heap headroom for API-embedded ingest (UI start/stop).
start_one api "$LOG_DIR/cfb-api.log" \
  env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" \
  node "$ROOT/apps/api/dist/main.js"

start_one web "$LOG_DIR/cfb-vite.log" \
  pnpm --filter @cfb/web dev

# Ingest: UI only via POST /api/ingest/start|stop (lives inside the API process).
# Do not start apps/ingest here.

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

start_one param-triggers "$LOG_DIR/cfb-param-triggers.log" \
  node "$ROOT/apps/worker/dist/main.js" param-triggers --interval=60

sleep 3
echo
echo "CFB processes:"
printf '  %-16s %s\n' "api" "http://localhost:3000  (log: $LOG_DIR/cfb-api.log)"
printf '  %-16s %s\n' "web" "http://localhost:5173  (log: $LOG_DIR/cfb-vite.log)"
printf '  %-16s %s\n' "ingest" "UI only (Start/Stop in web) — not auto-started"
printf '  %-16s %s\n' "poll-lists" "list audit / rings    (log: $LOG_DIR/cfb-poll-lists.log)"
printf '  %-16s %s\n' "listitem-stream" "live list members     (log: $LOG_DIR/cfb-listitem-stream.log)"
printf '  %-16s %s\n' "refresh-labels" "label sweep           (log: $LOG_DIR/cfb-refresh-labels.log)"
printf '  %-16s %s\n' "label-stream" "live labels (opt)     (log: $LOG_DIR/cfb-label-stream.log)"
printf '  %-16s %s\n' "param-triggers" "Param native triggers  (log: $LOG_DIR/cfb-param-triggers.log)"
echo
curl -s -o /dev/null -w "api health: %{http_code}\n" http://localhost:3000/api/health || true
tail -n 3 "$LOG_DIR/cfb-poll-lists.log" 2>/dev/null || true
tail -n 3 "$LOG_DIR/cfb-listitem-stream.log" 2>/dev/null || true
