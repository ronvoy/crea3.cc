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

# ── Ensure the external 'api' network exists ──────────────────────────────────
# docker-compose.yml declares an EXTERNAL network named "api" (ollama_net) so the
# backend can join a pre-existing Ollama network on the server. On machines where
# that network doesn't exist yet (older Docker refuses to start ANY service when
# an external network is missing), create it. Harmless if it already exists.
docker network create api >/dev/null 2>&1 || true

# ── CI/CD console (../_CICD, started with ../_CICD/run_cicd.sh) ───────────────
# If it has been started, hand its port + token to the backend so the admin
# panel (System → CI/CD) can embed the console. Optional: nothing breaks without it.
CICD_ENV="$ROOT_DIR/../_CICD/.env"
# (`|| true` — a missing file/key must not abort the script under set -e/pipefail)
cicd_get() { { grep "^$1=" "$CICD_ENV" 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }
CICD_PORT="$(cicd_get CICD_PORT)"
CICD_TOKEN="$(cicd_get CICD_TOKEN)"
CICD_PUBLIC_URL="$(cicd_get CICD_PUBLIC_URL)"

# ── Ensure infra (Keycloak / Postgres / Mailpit) is up ────────────────────────
if [[ -z "$(docker compose -f "$ROOT_DIR/docker-compose.yml" ps -q --status running keycloak 2>/dev/null)" ]]; then
  echo "Infra not running — starting db / keycloak / mailpit…"
  # Image pulls fail intermittently (registry/CDN hiccups: "httpReadSeeker …
  # EOF"). Retry a few times instead of letting `set -e` kill the whole run.
  infra_started=0
  for attempt in 1 2 3; do
    if docker compose -f "$ROOT_DIR/docker-compose.yml" up -d db keycloak mailpit; then
      infra_started=1
      break
    fi
    echo "  …infra start failed (attempt $attempt/3). Retrying in 5s…" >&2
    sleep 5
  done
  if [[ "$infra_started" -eq 1 ]]; then
    docker compose -f "$ROOT_DIR/docker-compose.yml" up keycloak-init >/dev/null 2>&1 || true
  else
    # The API + SPA run on SQLite and do not need Keycloak/Mailpit, so a
    # registry outage must not stop the platform from coming up.
    echo "  ⚠ Could not start the optional infra (registry unreachable?)." >&2
    echo "    Continuing without Keycloak/Mailpit — the app itself does not need them." >&2
    echo "    Re-run ./run_be.sh once the network is back to bring them up." >&2
  fi
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
# CREA3_DETACH=1 (used by the CI/CD console) starts the container in the
# background and returns; the default keeps it in the foreground (Ctrl+C stops).
RUN_ARGS=(
  --name "$NAME"
  --network "$NETWORK"
  -p 8000:8000
  -v "$BACKEND_DIR":/app
  -v "$FRONTEND_DIR/dist":/app/frontend_dist:ro
  --env-file "$BACKEND_DIR/.env"
  -e FRONTEND_DIST_DIR=/app/frontend_dist
  -e KEYCLOAK_INTERNAL_URL=http://keycloak:8080
  -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
  -e CICD_URL="${CICD_PORT:+http://host.docker.internal:$CICD_PORT}"
  -e CICD_PORT="$CICD_PORT"
  -e CICD_TOKEN="$CICD_TOKEN"
  -e CICD_PUBLIC_URL="$CICD_PUBLIC_URL"
  --add-host host.docker.internal:host-gateway
)
if [[ "${CREA3_DETACH:-0}" == "1" ]]; then
  docker run -d --restart unless-stopped "${RUN_ARGS[@]}" "$IMAGE" \
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload >/dev/null
  echo "App started in the background on http://localhost:8000"
  exit 0
fi
echo "App on http://localhost:8000  (SPA + API, single port; Ctrl+C to stop)"
exec docker run --rm "${RUN_ARGS[@]}" "$IMAGE" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
