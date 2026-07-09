#!/usr/bin/env bash
#
# run_be.sh — run the CREA3 backend (FastAPI) INSIDE a Docker container, in the
# foreground. Source is mounted so uvicorn --reload gives hot-reload during dev.
# Ctrl+C stops it. The container joins the compose network so it can reach
# Keycloak/Postgres/Mailpit by service name.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
NETWORK="crea3x_default"
IMAGE="crea3x-backend"
NAME="crea3x-backend"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "backend/.env not found — run ./run.sh once first to bootstrap everything." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required (this now runs the backend in a container). Install Docker Desktop." >&2
  exit 1
fi

# ── Ensure infra (Keycloak / Postgres / Mailpit) is up ────────────────────────
if [[ -z "$(docker compose -f "$ROOT_DIR/docker-compose.yml" ps -q --status running keycloak 2>/dev/null)" ]]; then
  echo "Infra not running — starting db / keycloak / keycloak-init / mailpit…"
  docker compose -f "$ROOT_DIR/docker-compose.yml" up -d db keycloak mailpit
  docker compose -f "$ROOT_DIR/docker-compose.yml" up keycloak-init >/dev/null 2>&1 || true
fi

# ── Build the backend image (deps live in site-packages, not /app, so the source
#    mount below doesn't hide them) ─────────────────────────────────────────────
echo "Building $IMAGE image…"
docker build -t "$IMAGE" "$BACKEND_DIR"

docker rm -f "$NAME" 2>/dev/null || true

# ── Run ───────────────────────────────────────────────────────────────────────
# - source mounted at /app -> uvicorn --reload picks up live changes
# - KEYCLOAK_INTERNAL_URL routes server->server calls (JWKS/admin) over the
#   compose network; KEYCLOAK_URL (from .env, :8082) stays the public issuer.
echo "Backend on http://localhost:8000 (Ctrl+C to stop)"
exec docker run --rm --name "$NAME" \
  --network "$NETWORK" \
  -p 8000:8000 \
  -v "$BACKEND_DIR":/app \
  --env-file "$BACKEND_DIR/.env" \
  -e KEYCLOAK_INTERNAL_URL=http://keycloak:8080 \
  -e OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-}" \
  --add-host host.docker.internal:host-gateway \
  "$IMAGE" \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
