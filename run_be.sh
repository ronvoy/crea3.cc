#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
  echo "Created backend/.env from .env.example"
fi

# The backend is self-contained (FastAPI + SQLite + its own JWT auth). No
# Keycloak / Postgres / Mailpit needed. Sent emails are recorded in the app's
# Outbox, viewable in the admin panel at /administrator.

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building crea3-backend image..."
docker build -t crea3-backend "$SCRIPT_DIR/backend"

# ── Stop any existing container ───────────────────────────────────────────────
docker rm -f crea3-backend 2>/dev/null || true

# ── Run ───────────────────────────────────────────────────────────────────────
# Source is mounted so uvicorn --reload picks up live changes.
echo "Starting backend container on http://localhost:8000"
docker run --rm \
  --name crea3-backend \
  -p 8000:8000 \
  -v "$SCRIPT_DIR/backend":/app \
  --env-file "$SCRIPT_DIR/backend/.env" \
  crea3-backend
