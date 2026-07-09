#!/usr/bin/env bash
#
# run_fe.sh — run the CREA3 frontend (Vite dev server) INSIDE a Docker container,
# in the foreground, with hot-module reload. Source is mounted; node_modules
# lives in a named volume (Linux binaries, kept separate from the host's).
# Ctrl+C stops it. The browser calls the backend directly on :8000 and Keycloak
# on :8082 (see frontend/.env), so this container needs no compose network.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
NAME="crea3x-frontend"
NODE_IMAGE="node:22-alpine"
MODULES_VOL="crea3x_frontend_node_modules"

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  echo "frontend/.env not found — run ./run.sh once first to bootstrap everything." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required (this now runs the frontend in a container). Install Docker Desktop." >&2
  exit 1
fi

docker rm -f "$NAME" 2>/dev/null || true

# npm install runs on first start (or when deps change) into the named volume;
# --host 0.0.0.0 makes Vite reachable from the host at http://localhost:5173.
echo "Frontend on http://localhost:5173 (Ctrl+C to stop)"
echo "(first run installs node_modules in the container — this can take a minute)"
exec docker run --rm --name "$NAME" \
  -p 5173:5173 \
  -v "$FRONTEND_DIR":/app \
  -v "$MODULES_VOL":/app/node_modules \
  -w /app \
  "$NODE_IMAGE" \
  sh -c "npm install --no-audit --no-fund && npm run dev -- --host 0.0.0.0 --port 5173"
