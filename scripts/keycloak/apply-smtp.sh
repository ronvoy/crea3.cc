#!/usr/bin/env bash
set -euo pipefail

KC_URL="${KEYCLOAK_INTERNAL_URL:-http://keycloak:8080}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="${KEYCLOAK_REALM:-crea}"

SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-25}"
SMTP_FROM="${SMTP_FROM:-}"
SMTP_FROM_NAME="${SMTP_FROM_NAME:-}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_STARTTLS="${SMTP_STARTTLS:-false}"
SMTP_SSL="${SMTP_SSL:-false}"

echo "[keycloak-init] Target: ${KC_URL} realm=${REALM}"

# Wait until Keycloak accepts admin login
echo "[keycloak-init] Waiting for Keycloak to be ready..."
for i in {1..90}; do
  if /opt/keycloak/bin/kcadm.sh config credentials \
      --server "${KC_URL}" \
      --realm master \
      --user "${KC_ADMIN}" \
      --password "${KC_PASS}" >/dev/null 2>&1; then
    echo "[keycloak-init] Keycloak is ready."
    break
  fi
  sleep 2
  if [ "$i" -eq 90 ]; then
    echo "[keycloak-init] ERROR: Keycloak did not become ready in time." >&2
    exit 1
  fi
done

if [ -z "${SMTP_HOST}" ]; then
  echo "[keycloak-init] SMTP_HOST is empty; skipping SMTP configuration."
  exit 0
fi

AUTH="false"
if [ -n "${SMTP_USER}" ] || [ -n "${SMTP_PASS}" ]; then
  AUTH="true"
fi

echo "[keycloak-init] Applying SMTP settings:"
echo "  host=${SMTP_HOST} port=${SMTP_PORT} from=${SMTP_FROM} name=${SMTP_FROM_NAME}"
echo "  starttls=${SMTP_STARTTLS} ssl=${SMTP_SSL} auth=${AUTH}"

# Build kcadm args
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
  ARGS+=(
    -s "smtpServer.user=${SMTP_USER}"
    -s "smtpServer.password=${SMTP_PASS}"
  )
fi

/opt/keycloak/bin/kcadm.sh update "realms/${REALM}" "${ARGS[@]}" >/dev/null

echo "[keycloak-init] SMTP configuration applied successfully."
