#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/frontend/.env" ]; then
  cp "$SCRIPT_DIR/frontend/.env.example" "$SCRIPT_DIR/frontend/.env"
  echo "Created frontend/.env from .env.example"
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Building crea3-frontend image..."
docker build -t crea3-frontend "$SCRIPT_DIR/frontend"

# ── Stop any existing container ───────────────────────────────────────────────
docker rm -f crea3-frontend 2>/dev/null || true

# ── Run ───────────────────────────────────────────────────────────────────────
# Source is mounted so Vite HMR picks up live changes.
# node_modules anonymous volume preserves the container's installed packages.
# VITE_API_BASE is set so the browser calls the backend directly (no proxy
# needed across containers); CORS on the backend already allows localhost:5173.
echo "Starting frontend container on http://localhost:5173"
docker run --rm \
  --name crea3-frontend \
  -p 5173:5173 \
  -v "$SCRIPT_DIR/frontend":/app \
  -v /app/node_modules \
  -e VITE_API_BASE=http://localhost:8000 \
  crea3-frontend
