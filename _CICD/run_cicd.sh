#!/usr/bin/env bash
#
# run_cicd.sh — build & start the CREA3 CI/CD console (container crea3-cicd).
#
#   ./run_cicd.sh            start (port 8088, or the next free one)
#   ./run_cicd.sh --down     stop and remove
#   ./run_cicd.sh --logs     follow the logs
#   ./run_cicd.sh --url      print the console URL (with token)
#
# Persists CICD_PORT, CICD_TOKEN and HOST_REPO_DIR in ./.env; _CREA3x/run_be.sh
# reads that file so the platform's admin panel (System → CI/CD) can embed the
# console without any manual configuration.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
ENV_FILE="$HERE/.env"
cd "$HERE"

# Lookups must never fail under `set -e -o pipefail`: a missing key is "".
get() { { grep "^$1=" "$ENV_FILE" 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }
put() { if grep -q "^$1=" "$ENV_FILE" 2>/dev/null; then sed -i.bak "s#^$1=.*#$1=$2#" "$ENV_FILE" && rm -f "$ENV_FILE.bak"; else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi; }
port_free() {
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 && return 1; fi
  if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | grep -q ":$1 " && return 1; fi
  return 0
}

touch "$ENV_FILE"; chmod 600 "$ENV_FILE"   # holds the console token
case "${1:-}" in
  --down) docker compose down; echo "CI/CD console stopped."; exit 0 ;;
  --logs) exec docker compose logs -f ;;
  --url)  echo "http://localhost:$(get CICD_PORT)/?token=$(get CICD_TOKEN)"; exit 0 ;;
esac

# Port: keep the persisted one if still free (or already ours), else 8088 or the next free port.
PORT="$(get CICD_PORT)"
if [[ -z "$PORT" ]] || { ! port_free "$PORT" && ! { docker ps --format '{{.Names}}' 2>/dev/null || true; } | grep -qx crea3-cicd; }; then
  PORT=8088
  while ! port_free "$PORT"; do PORT=$((PORT + 1)); done
fi
put CICD_PORT "$PORT"
[[ -n "$(get CICD_TOKEN)" ]] || put CICD_TOKEN "$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
put HOST_REPO_DIR "$REPO"
chmod 600 "$ENV_FILE"
grep -q '^CICD_WEBHOOK_SECRET=' "$ENV_FILE" || printf '# Optional: GitHub webhook secret + branch to auto-deploy on push (targets: _CREA3x,_CREA3-Chatbot)\nCICD_WEBHOOK_SECRET=\nCICD_AUTO_DEPLOY_BRANCH=\nCICD_AUTO_DEPLOY_TARGETS=_CREA3x\n' >> "$ENV_FILE"

docker compose up -d --build

# ── Verify: the console must be up AND accept the token in ./.env ────────────
TOKEN="$(get CICD_TOKEN)"
URL="http://localhost:$PORT"
fp() { printf '%s' "$1" | shasum -a 256 2>/dev/null | cut -c1-8 || printf '%s' "$1" | sha256sum | cut -c1-8; }
health() { curl -fsS -m 3 "$URL/health" 2>/dev/null; }

up=0
for _ in $(seq 1 25); do
  if health >/dev/null; then up=1; break; fi
  sleep 1
done

check_ok() { curl -fsS -m 5 -H "X-CICD-Token: $TOKEN" "$URL/api/status" >/dev/null 2>&1; }

if [[ "$up" -eq 1 ]] && ! check_ok; then
  echo "  the running container rejected the token — recreating it…"
  docker compose up -d --force-recreate >/dev/null
  for _ in $(seq 1 25); do health >/dev/null && break; sleep 1; done
fi

echo
if [[ "$up" -ne 1 ]]; then
  echo "⚠ The console did not answer on $URL/health" >&2
  echo "  docker compose logs --tail=40" >&2
elif check_ok; then
  echo "✓ CI/CD console ready."
else
  # Precise diagnosis from /health (fingerprints only, never the token itself)
  H="$(health || echo '{}')"
  jq_get() { printf '%s' "$H" | python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }
  echo "⚠ The console is running but does not accept the token in $ENV_FILE." >&2
  echo "    token in .env    : $(fp "$TOKEN")" >&2
  echo "    accepted by it   : $(jq_get accepts)" >&2
  echo "    repo path in it  : $(jq_get repo)  (mounted: $(jq_get repo_mounted))" >&2
  echo "    reads .env from  : $(jq_get env_file)  (readable: $(jq_get env_file_readable)) $(jq_get env_file_error)" >&2
  echo "  Most often the container predates this checkout. Force a clean start:" >&2
  echo "    docker rm -f crea3-cicd && ./run_cicd.sh" >&2
fi
echo "CI/CD console: $URL/?token=$TOKEN"
echo "  (the platform's admin panel → System → CI/CD embeds it automatically after ./run_be.sh)"
