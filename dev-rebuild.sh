#!/bin/bash
# Rebuild everything, then start all CFB processes (api, web, ingest, workers).
set -euo pipefail
cd "$(dirname "$0")"
exec ./dev-start.sh --build
