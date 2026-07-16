#!/usr/bin/env bash
#
# run_be.sh — SINGLE-PORT run (like _CREA3): builds the frontend and serves BOTH
# the SPA and the API from one backend container on http://localhost:8000.
# Source is mounted so uvicorn --reload hot-reloads backend code. Ctrl+C stops it.
# The container joins the compose network to reach Keycloak/Postgres/Mailpit.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
NETWORK="crea3x_default"
IMAGE="crea3x-backend"
NAME="crea3x-backend"
NODE_IMAGE="node:22-alpine"
MODULES_VOL="crea3x_frontend_node_modules"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "backend/.env not found — run ./run.sh once first to bootstrap everything." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required (backend + frontend run in containers)." >&2
  exit 1
fi

# ── Ensure infra (Keycloak / Postgres / Mailpit) is up ────────────────────────
if [[ -z "$(docker compose -f "$ROOT_DIR/docker-compose.yml" ps -q --status running keycloak 2>/dev/null)" ]]; then
  echo "Infra not running — starting db / keycloak / mailpit…"
  docker compose -f "$ROOT_DIR/docker-compose.yml" up -d db keycloak mailpit
  docker compose -f "$ROOT_DIR/docker-compose.yml" up keycloak-init >/dev/null 2>&1 || true
fi

# ── Build the frontend (relative /api, single origin) → frontend/dist ─────────
echo "Building the frontend (single-port dist)…"
docker run --rm \
  -v "$FRONTEND_DIR":/app \
  -v "$MODULES_VOL":/app/node_modules \
  -w /app \
  "$NODE_IMAGE" \
  sh -c "npm install --no-audit --no-fund && npm run build"

# ── Build the backend image ───────────────────────────────────────────────────
echo "Building $IMAGE image…"
docker build -t "$IMAGE" "$BACKEND_DIR"
docker rm -f "$NAME" 2>/dev/null || true

# ── Run: backend serves the SPA (FRONTEND_DIST_DIR) + API on :8000 ────────────
echo "App on http://localhost:8000  (SPA + API, single port; Ctrl+C to stop)"
exec docker run --rm --name "$NAME" \
  --network "$NETWORK" \
  -p 8000:8000 \
  -v "$BACKEND_DIR":/app \
  -v "$FRONTEND_DIR/dist":/app/frontend_dist:ro \
  --env-file "$BACKEND_DIR/.env" \
  -e FRONTEND_DIST_DIR=/app/frontend_dist \
  -e KEYCLOAK_INTERNAL_URL=http://keycloak:8080 \
  -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}" \
  --add-host host.docker.internal:host-gateway \
  "$IMAGE" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
