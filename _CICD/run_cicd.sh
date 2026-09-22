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
# (A container started earlier can hold a stale token — e.g. .env was replaced
#  by env.sh afterwards. The service re-reads the file per request, so this
#  normally passes; if it does not, recreate the container once.)
TOKEN="$(get CICD_TOKEN)"
URL="http://localhost:$PORT"
ok=0
for _ in $(seq 1 20); do
  if curl -fsS -m 3 "$URL/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [[ "$ok" -eq 1 ]] && ! curl -fsS -m 5 -H "X-CICD-Token: $TOKEN" "$URL/api/status" >/dev/null 2>&1; then
  echo "  token rejected by the running container — recreating it…"
  docker compose up -d --build --force-recreate
  sleep 3
fi

echo
if [[ "$ok" -ne 1 ]]; then
  echo "⚠ The console did not answer on $URL/health — check: docker compose logs -f" >&2
elif curl -fsS -m 5 -H "X-CICD-Token: $TOKEN" "$URL/api/status" >/dev/null 2>&1; then
  echo "✓ CI/CD console ready."
else
  echo "⚠ The console is running but rejected the token in ./.env." >&2
  echo "  Check CICD_TOKEN in $ENV_FILE, then: docker compose up -d --force-recreate" >&2
fi
echo "CI/CD console: $URL/?token=$TOKEN"
echo "  (the platform's admin panel → System → CI/CD embeds it automatically after ./run_be.sh)"
