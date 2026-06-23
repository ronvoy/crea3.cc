#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
  echo "Created backend/.env from .env.example"
fi

# ── Ensure infra (Keycloak/db/mailpit) is running ─────────────────────────────
# Check that the keycloak container is actually running — not just that the
# compose network exists (the network can survive after the containers are gone).
NETWORK="crea3_default"
if [ -z "$(docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps -q --status running keycloak 2>/dev/null)" ]; then
  echo "Infra not running — starting Keycloak/db/mailpit..."
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building crea3-backend image..."
docker build -t crea3-backend "$SCRIPT_DIR/backend"

# ── Stop any existing container ───────────────────────────────────────────────
docker rm -f crea3-backend 2>/dev/null || true

# ── Run ───────────────────────────────────────────────────────────────────────
# Source is mounted so uvicorn --reload picks up live changes.
# KEYCLOAK_URL is overridden to use the internal Docker hostname 'keycloak'.
echo "Starting backend container on http://localhost:8000"
docker run --rm \
  --name crea3-backend \
  --network "$NETWORK" \
  -p 8000:8000 \
  -v "$SCRIPT_DIR/backend":/app \
  --env-file "$SCRIPT_DIR/backend/.env" \
  -e KEYCLOAK_URL=http://keycloak:8080 \
  -e KEYCLOAK_PUBLIC_URL=http://localhost:8080 \
  -e SMTP_HOST=mailpit \
  -e SMTP_PORT=1025 \
  crea3-backend
