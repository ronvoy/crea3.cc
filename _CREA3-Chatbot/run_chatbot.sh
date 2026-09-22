#!/usr/bin/env bash
#
# run_chatbot.sh — build & run the CREA3 LexAI chatbot (Mistral) in Docker.
#
#   ./run_chatbot.sh                 build + start, wait for /health, print endpoint
#   ./run_chatbot.sh --down          stop and remove the container
#   ./run_chatbot.sh --logs          follow the container logs
#   ./run_chatbot.sh --rebuild       rebuild the FAISS indices with current .env embeddings
#   ./run_chatbot.sh --rebuild-mistral
#                                    switch to single-key Mistral embeddings
#                                    (mistral-embed, 1024-dim) and rebuild all indices
#
# The chat model is Mistral (ministral-8b-latest by default); retrieval embeddings
# default to OpenAI text-embedding-3-small to reuse the prebuilt indices.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
ENV_FILE="$ROOT_DIR/.env"
PORT_DEFAULT=8094

# docker compose v2 (plugin) or legacy v1
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  echo "ERROR: Docker Compose is required (install Docker Desktop)." >&2
  exit 1
fi

# ── Bootstrap .env from the template on first run ─────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  echo "Created .env from .env.example — set MISTRAL_API_KEY (and OPENAI_API_KEY for"
  echo "embeddings) in $ENV_FILE, then re-run ./run_chatbot.sh."
  exit 1
fi

# Load .env so we can validate keys and read the port.
set -a; . "$ENV_FILE"; set +a
PORT="${BACKEND_PORT:-$PORT_DEFAULT}"

# ── Sub-commands ──────────────────────────────────────────────────────────────
case "${1:-}" in
  --down)  "${DC[@]}" down; echo "Chatbot stopped."; exit 0 ;;
  --logs)  exec "${DC[@]}" logs -f ;;
esac

require_key() {  # name, human hint
  local val="${!1:-}"
  if [[ -z "$val" ]]; then
    echo "ERROR: $1 is empty in .env — $2" >&2
    exit 1
  fi
}

# ── Validate keys for the selected providers ──────────────────────────────────
STACK="${LLM_TECH_STACK:-mistral}"
case "$STACK" in
  mistral) require_key MISTRAL_API_KEY "get one at https://console.mistral.ai/" ;;
  openai)  require_key OPENAI_API_KEY  "get one at https://platform.openai.com/" ;;
  groq)    require_key GROQ_API_KEY    "get one at https://console.groq.com/" ;;
esac
EMB="${EMBEDDING_BACKEND:-openai}"
if [[ "$EMB" == "openai" ]]; then
  require_key OPENAI_API_KEY "retrieval embeddings need it (or switch to EMBEDDING_BACKEND=mistral + rebuild)"
fi

# ── Optional index rebuild ────────────────────────────────────────────────────
if [[ "${1:-}" == "--rebuild-mistral" ]]; then
  echo "Switching embeddings to Mistral (mistral-embed) and rebuilding indices…"
  # Persist the switch in .env (idempotent).
  if grep -q '^EMBEDDING_BACKEND=' "$ENV_FILE"; then
    sed -i.bak 's/^EMBEDDING_BACKEND=.*/EMBEDDING_BACKEND=mistral/' "$ENV_FILE"
  else echo 'EMBEDDING_BACKEND=mistral' >> "$ENV_FILE"; fi
  if grep -q '^EMBEDDING_MODEL=' "$ENV_FILE"; then
    sed -i.bak 's/^EMBEDDING_MODEL=.*/EMBEDDING_MODEL=mistral-embed/' "$ENV_FILE"
  else echo 'EMBEDDING_MODEL=mistral-embed' >> "$ENV_FILE"; fi
  rm -f "$ENV_FILE.bak"
  set -a; . "$ENV_FILE"; set +a
fi

echo "Building image…"
"${DC[@]}" build

if [[ "${1:-}" == "--rebuild" || "${1:-}" == "--rebuild-mistral" ]]; then
  echo "Rebuilding FAISS indices inside the container (this can take a while)…"
  "${DC[@]}" run --rm backend python build_index.py --data-dir data/
fi

echo "Starting chatbot…"
"${DC[@]}" up -d

# ── Wait for readiness ────────────────────────────────────────────────────────
# CHATBOT_HEALTH_HOST lets the CI/CD console (a container) poll the host port.
URL="http://${CHATBOT_HEALTH_HOST:-localhost}:${PORT}"
printf "Waiting for the API on %s " "$URL/health"
for _ in $(seq 1 40); do
  if curl -fsS "$URL/health" >/dev/null 2>&1; then
    echo
    echo "✓ Chatbot is up."
    echo "  Health : $URL/health"
    echo "  Chat   : POST $URL/chat   { \"question\": \"…\" }"
    echo "  Point _CREA3x at it with:  LEGAL_AI_URL=$URL/chat"
    curl -fsS "$URL/health" || true; echo
    exit 0
  fi
  printf "."; sleep 3
done

echo
echo "The API did not become ready in time — check logs with: ./run_chatbot.sh --logs" >&2
exit 1
