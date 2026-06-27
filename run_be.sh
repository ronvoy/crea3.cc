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
# If the frontend has been built, serve it from the backend so the whole app is
# reachable on ONE origin (http://localhost:8000) — ideal for tunnels / prod.
# Build it first with a RELATIVE api base:
#   docker exec -e VITE_API_BASE= crea3-frontend npx vite build
#   (or:  cd frontend && VITE_API_BASE= npm run build )
DIST_MOUNT=()
if [ -d "$SCRIPT_DIR/frontend/dist" ]; then
  DIST_MOUNT=(-v "$SCRIPT_DIR/frontend/dist":/app/frontend_dist:ro -e FRONTEND_DIST_DIR=/app/frontend_dist)
  echo "Serving built frontend from the backend (single origin)."
fi

echo "Starting backend container on http://localhost:8000"
docker run --rm \
  --name crea3-backend \
  -p 8000:8000 \
  -v "$SCRIPT_DIR/backend":/app \
  --env-file "$SCRIPT_DIR/backend/.env" \
  "${DIST_MOUNT[@]}" \
  crea3-backend
