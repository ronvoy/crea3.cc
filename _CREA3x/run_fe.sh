#!/usr/bin/env bash
#
# run_fe.sh — run ONLY the CREA3 frontend (Vite dev server) in the foreground.
#
# Expects the one-time setup done by ./run.sh (frontend/.env, Docker infra).
# Use this in its own terminal for frontend dev; Ctrl+C stops it.
# The Vite dev proxy forwards /api to the backend on :8000 (see run_be.sh).
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  echo "frontend/.env not found — run ./run.sh once first to bootstrap everything." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found — run ./run.sh once first (it installs Node), or: brew install node" >&2
  exit 1
fi

cd "$FRONTEND_DIR"
if [[ ! -d node_modules ]]; then
  npm install --no-audit --no-fund
fi

echo "Frontend on http://localhost:5173 (Ctrl+C to stop)"
exec npm run dev
