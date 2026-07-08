#!/usr/bin/env bash
#
# run_be.sh — run ONLY the CREA3 backend (FastAPI) in the foreground.
#
# Expects the one-time setup done by ./run.sh (env files, Docker infra:
# Keycloak/Postgres/Mailpit). Use this in its own terminal for backend dev;
# Ctrl+C stops it. Logs print straight to the terminal.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "backend/.env not found — run ./run.sh once first to bootstrap everything." >&2
  exit 1
fi

# Warn (don't block) if the Keycloak container isn't reachable.
KC_URL="$(grep -E '^KEYCLOAK_URL=' "$BACKEND_DIR/.env" | tail -1 | cut -d= -f2-)"
if [[ -n "${KC_URL:-}" ]] && ! curl -fsS --max-time 3 "${KC_URL}/realms/master" >/dev/null 2>&1; then
  echo "! Keycloak not reachable at ${KC_URL} — start infra with:  docker compose up -d db keycloak mailpit" >&2
fi

# Pick a Python the pinned deps support (3.11–3.13; system 3.14 breaks them).
PYBIN=""
for c in python3.12 python3.13 python3.11; do
  if command -v "$c" >/dev/null 2>&1; then PYBIN="$c"; break; fi
done
if [[ -z "$PYBIN" ]]; then
  v="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0)"
  case "$v" in 3.11|3.12|3.13) PYBIN=python3 ;; *)
    echo "No compatible Python (3.11–3.13) found — run ./run.sh once, or: brew install python@3.12" >&2
    exit 1 ;;
  esac
fi

cd "$BACKEND_DIR"
# Recreate the venv if it's missing, or broken/moved: a venv copied from another
# path keeps stale absolute shebangs (e.g. bin/pip points at a Python that no
# longer exists), so `.venv/bin/pip` fails with "bad interpreter". Testing pip
# via its own shebang detects exactly that.
if [[ -d .venv ]] && ! .venv/bin/pip --version >/dev/null 2>&1; then
  echo "Recreating virtualenv (existing one is broken or was moved)…"
  rm -rf .venv
fi
if [[ ! -d .venv ]]; then "$PYBIN" -m venv .venv; fi
# Use `python -m pip` (shebang-independent) so installs work regardless.
.venv/bin/python -m pip install --quiet -r requirements.txt

# Clear any stale backend still holding the port, and wait for it to release.
pkill -f "uvicorn app.main:app" 2>/dev/null || true
for i in $(seq 1 10); do
  lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
  [[ $i -eq 10 ]] && { echo "Port 8000 is still in use by another process (lsof -i :8000)." >&2; exit 1; }
done

echo "Backend on http://127.0.0.1:8000 (Ctrl+C to stop)"
exec .venv/bin/python -m uvicorn app.main:app --reload --port 8000
