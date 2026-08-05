#!/usr/bin/env bash
#
# reset.sh — FULL fresh-start reset for _CREA3x.
#
# Destroys the running stack and wipes state so the next ./run_be.sh starts from
# a clean slate:
#   • stops + removes the backend, db, keycloak, keycloak-init and mailpit containers
#   • removes the Keycloak Postgres volume  (crea3x_keycloak_db)  -> ALL Keycloak
#     users/realms gone; the realm is re-imported fresh from infra/keycloak/
#   • removes the backend SQLite/report/upload volumes               (app data gone)
#   • removes the built images so they are rebuilt next run
#   • brings the infra back up and re-applies keycloak-init (client secret,
#     direct grants, SMTP) so the realm is immediately usable
#
# It does NOT touch your .env files or the frontend node_modules cache (add
# --hard to also drop node_modules).
#
# Usage:
#   ./reset.sh            # ask for confirmation, then reset
#   ./reset.sh -y         # no prompt (for scripts)
#   ./reset.sh --keep-images   # keep built images (faster next run)
#   ./reset.sh --hard     # also remove the frontend node_modules volume
#   ./reset.sh --down-only     # just tear everything down; don't bring infra back
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
BACKEND_NAME="crea3x-backend"
BACKEND_IMAGE="crea3x-backend"
FRONTEND_DEV_NAME="crea3x-frontend"
KC_DB_VOLUME="crea3x_keycloak_db"
MODULES_VOLUME="crea3x_frontend_node_modules"
BACKEND_VOLUMES=("crea3x_crea_backend_data" "crea3x_crea_reports" "crea3x_crea_uploads")

ASSUME_YES=0
KEEP_IMAGES=0
HARD=0
DOWN_ONLY=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes)      ASSUME_YES=1 ;;
    --keep-images) KEEP_IMAGES=1 ;;
    --hard)        HARD=1 ;;
    --down-only)   DOWN_ONLY=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg  (see ./reset.sh --help)" >&2; exit 1 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2; exit 1
fi

echo "This will DESTROY the _CREA3x stack and wipe ALL Keycloak users + app data."
echo "  • containers: $BACKEND_NAME, db, keycloak, keycloak-init, mailpit"
echo "  • volumes:    $KC_DB_VOLUME  +  backend data/reports/uploads"
[ "$KEEP_IMAGES" -eq 0 ] && echo "  • images:     $BACKEND_IMAGE (+ compose-built frontend)"
[ "$HARD" -eq 1 ]        && echo "  • node_modules cache: $MODULES_VOLUME"
echo "  (.env files are NOT touched)"
echo ""
if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Type 'reset' to continue: " reply
  [ "$reply" = "reset" ] || { echo "Aborted."; exit 1; }
fi

echo ""
echo "── 1/4  Stopping standalone containers ───────────────────────────────────"
docker rm -f "$BACKEND_NAME" "$FRONTEND_DEV_NAME" 2>/dev/null || true

echo "── 2/4  Tearing down compose (containers + named volumes) ────────────────"
# The compose file references an EXTERNAL network named "api"; older Docker
# refuses to run any compose command when it's missing. Create it if absent.
docker network create api >/dev/null 2>&1 || true
# --volumes removes the compose-managed named volumes declared in the file
# (keycloak_db + backend data/reports/uploads). --rmi local drops built images.
DOWN_ARGS=(down --volumes --remove-orphans)
[ "$KEEP_IMAGES" -eq 0 ] && DOWN_ARGS+=(--rmi local)
docker compose -f "$COMPOSE_FILE" "${DOWN_ARGS[@]}" || true

echo "── 3/4  Removing leftover volumes / images ───────────────────────────────"
# Belt-and-suspenders: remove volumes by name in case they were orphaned or the
# project prefix differs.
docker volume rm "$KC_DB_VOLUME" "${BACKEND_VOLUMES[@]}" 2>/dev/null || true
[ "$HARD" -eq 1 ] && { docker volume rm "$MODULES_VOLUME" 2>/dev/null || true; }
[ "$KEEP_IMAGES" -eq 0 ] && { docker image rm -f "$BACKEND_IMAGE" 2>/dev/null || true; }

if [ "$DOWN_ONLY" -eq 1 ]; then
  echo ""
  echo "✔ Torn down. (--down-only) Run ./run_be.sh to build and start fresh."
  exit 0
fi

echo "── 4/4  Bringing infra back up (fresh realm import) ──────────────────────"
docker compose -f "$COMPOSE_FILE" up -d db keycloak mailpit

echo -n "   waiting for Keycloak"
for i in $(seq 1 90); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8082/realms/crea 2>/dev/null)" = "200" ]; then
    echo " — up"; break
  fi
  echo -n "."; sleep 2
  [ "$i" -eq 90 ] && { echo ""; echo "!! Keycloak did not become ready; check: docker compose logs keycloak"; exit 1; }
done

echo "   applying keycloak-init (client secret + direct grants + SMTP)…"
docker compose -f "$COMPOSE_FILE" up keycloak-init 2>&1 | grep -iE "secret|direct|SMTP|Done" | sed 's/^/     /' || true

echo ""
echo "✔ Reset complete — Keycloak has 0 users and a fresh realm."
echo "  Next:  ./run_be.sh        (builds the SPA + backend, serves on :8000)"
