#!/usr/bin/env bash
# Idempotent Keycloak configuration applied on every `keycloak-init` run:
#   1) crea-backend  -> set client secret to match the backend env (fixes
#      "invalid_client_credentials") and ensure the service account is on.
#   2) crea-frontend -> public client, direct grants ON, redirect/web origins
#      that include the app's public URL (embedded login + hosted fallback).
#   3) realm SMTP    -> from SMTP_* env (skipped when SMTP_HOST is empty).
set -euo pipefail

KC_URL="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="${KEYCLOAK_REALM:-crea}"

FRONTEND_CID="${KEYCLOAK_CLIENT_ID:-crea-frontend}"
BACKEND_CID="${KEYCLOAK_ADMIN_CLIENT_ID:-crea-backend}"
BACKEND_SECRET="${KEYCLOAK_ADMIN_CLIENT_SECRET:-crea-backend-dev-secret-change-me}"
APP_URL="${APP_PUBLIC_URL:-http://localhost}"

KCADM=/opt/keycloak/bin/kcadm.sh

echo "[keycloak-init] Target: ${KC_URL} realm=${REALM}"

# ---- Wait until Keycloak accepts admin login -------------------------------
echo "[keycloak-init] Waiting for Keycloak to be ready..."
for i in {1..90}; do
  if "${KCADM}" config credentials \
      --server "${KC_URL}" --realm master \
      --user "${KC_ADMIN}" --password "${KC_PASS}" >/dev/null 2>&1; then
    echo "[keycloak-init] Keycloak is ready."
    break
  fi
  sleep 2
  if [ "$i" -eq 90 ]; then
    echo "[keycloak-init] ERROR: Keycloak did not become ready in time." >&2
    exit 1
  fi
done

client_uuid() {
  "${KCADM}" get clients -r "${REALM}" -q clientId="$1" --fields id --format csv --noquotes 2>/dev/null \
    | tr -d '\r' | head -n1 || true
}

# ---- 1) Backend confidential client: align secret --------------------------
BID="$(client_uuid "${BACKEND_CID}")"
if [ -n "${BID}" ]; then
  "${KCADM}" update "clients/${BID}" -r "${REALM}" \
    -s "serviceAccountsEnabled=true" \
    -s "secret=${BACKEND_SECRET}" >/dev/null
  echo "[keycloak-init] ${BACKEND_CID}: client secret set from env; service account enabled."
else
  echo "[keycloak-init] WARN: client '${BACKEND_CID}' not found; skipping secret." >&2
fi

# ---- 2) Frontend public client: direct grants + origins --------------------
FID="$(client_uuid "${FRONTEND_CID}")"
if [ -n "${FID}" ]; then
  # redirect/web origins set to "*" so the embedded login (CORS) and hosted
  # fallback / email links work no matter which origin you tunnel through.
  # Tighten these to your exact domain(s) for a hardened production setup.
  "${KCADM}" update "clients/${FID}" -r "${REALM}" \
    -s "publicClient=true" \
    -s "standardFlowEnabled=true" \
    -s "directAccessGrantsEnabled=true" \
    -s "redirectUris=[\"*\"]" \
    -s "webOrigins=[\"*\"]" >/dev/null
  echo "[keycloak-init] ${FRONTEND_CID}: direct grants ON; redirect/web origins = * (any origin)."
else
  echo "[keycloak-init] WARN: client '${FRONTEND_CID}' not found; skipping." >&2
fi

# ---- 3) SMTP on the realm --------------------------------------------------
SMTP_HOST="${SMTP_HOST:-}"
if [ -z "${SMTP_HOST}" ]; then
  echo "[keycloak-init] SMTP_HOST is empty; skipping SMTP configuration."
  echo "[keycloak-init] Done."
  exit 0
fi

SMTP_PORT="${SMTP_PORT:-25}"
SMTP_FROM="${SMTP_FROM:-}"
SMTP_FROM_NAME="${SMTP_FROM_NAME:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_STARTTLS="${SMTP_STARTTLS:-false}"
SMTP_SSL="${SMTP_SSL:-false}"

AUTH="false"
if [ -n "${SMTP_USER}" ] || [ -n "${SMTP_PASS}" ]; then AUTH="true"; fi

echo "[keycloak-init] Applying SMTP settings:"
echo "  host=${SMTP_HOST} port=${SMTP_PORT} from=${SMTP_FROM} name=${SMTP_FROM_NAME}"
echo "  starttls=${SMTP_STARTTLS} ssl=${SMTP_SSL} auth=${AUTH}"

ARGS=(
  -s "smtpServer.host=${SMTP_HOST}"
  -s "smtpServer.port=${SMTP_PORT}"
  -s "smtpServer.from=${SMTP_FROM}"
  -s "smtpServer.fromDisplayName=${SMTP_FROM_NAME}"
  -s "smtpServer.starttls=${SMTP_STARTTLS}"
  -s "smtpServer.ssl=${SMTP_SSL}"
  -s "smtpServer.auth=${AUTH}"
)
if [ "${AUTH}" = "true" ]; then
  ARGS+=( -s "smtpServer.user=${SMTP_USER}" -s "smtpServer.password=${SMTP_PASS}" )
fi

"${KCADM}" update "realms/${REALM}" "${ARGS[@]}" >/dev/null
echo "[keycloak-init] SMTP configuration applied successfully."
echo "[keycloak-init] Done."
