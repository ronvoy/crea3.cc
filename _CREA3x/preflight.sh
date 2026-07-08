#!/usr/bin/env bash
#
# preflight.sh — CREA3 platform preflight check
# Runs the full local test/build suite for backend and frontend and prints a
# professional, colour-coded report. Exit code 0 = all green, non-zero = failure.
#
# Usage:
#   ./preflight.sh            # run everything
#   ./preflight.sh --quick    # skip the (slower) frontend production build
#   ./preflight.sh --no-color # plain output (for CI logs)
#
set -uo pipefail

# ----------------------------------------------------------------------------
# Resolve paths (script can be run from anywhere)
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

QUICK=0
USE_COLOR=1
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --no-color) USE_COLOR=0 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  esac
done

# ----------------------------------------------------------------------------
# Colours
# ----------------------------------------------------------------------------
if [[ "$USE_COLOR" == "1" && -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  BLUE=$'\033[34m'; CYAN=$'\033[36m'; GREY=$'\033[90m'
else
  BOLD=""; DIM=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; GREY=""
fi

PASS=0; FAIL=0; SKIP=0
FAILED_STEPS=()

# ----------------------------------------------------------------------------
# CREA3 banner (framed card, ANSI)
# ----------------------------------------------------------------------------
banner() {
  if [[ "$USE_COLOR" == "1" ]]; then
    local B=$'\033[38;5;39m' D=$'\033[38;5;33m' G=$'\033[38;5;220m' F=$'\033[38;5;245m'
    printf "%b" "\
${F}┌──────────────────────────────────────────────────────────┐${RESET}
${F}│${RESET}                                                          ${F}│${RESET}
${F}│${RESET}   ${BOLD}${B} ██████╗██████╗ ███████╗ █████╗ ${G}██████╗${RESET}                   ${F}│${RESET}
${F}│${RESET}   ${BOLD}${B}██╔════╝██╔══██╗██╔════╝██╔══██╗${G}╚════██╗${RESET}                  ${F}│${RESET}
${F}│${RESET}   ${BOLD}${B}██║     ██████╔╝█████╗  ███████║${G} █████╔╝${RESET}                  ${F}│${RESET}
${F}│${RESET}   ${BOLD}${B}██║     ██╔══██╗██╔══╝  ██╔══██║${G} ╚═══██╗${RESET}                  ${F}│${RESET}
${F}│${RESET}   ${BOLD}${B}╚██████╗██║  ██║███████╗██║  ██║${G}██████╔╝${RESET}                  ${F}│${RESET}
${F}│${RESET}   ${BOLD}${D} ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝${G}╚═════╝ ${RESET}                  ${F}│${RESET}
${F}│${RESET}                                                          ${F}│${RESET}
${F}│${RESET}   ${DIM}Conflict Resolution with Equitative Algorithms${RESET}         ${F}│${RESET}
${F}│${RESET}                                                          ${F}│${RESET}
${F}└──────────────────────────────────────────────────────────┘${RESET}
"
  else
    cat <<'PLAIN'
+----------------------------------------------------------+
|                                                          |
|    CCCCC  RRRRR  EEEEE  AAAAA   33333                    |
|   C       R   R  E      A   A       3                    |
|   C       RRRRR  EEEE   AAAAA   3333                     |
|   C       R  R   E      A   A       3                    |
|    CCCCC  R   R  EEEEE  A   A   33333                    |
|                                                          |
|   Conflict Resolution with Equitative Algorithms         |
|                                                          |
+----------------------------------------------------------+
PLAIN
  fi
  printf "  %sPlatform preflight check%s  ·  %s%s%s\n\n" "$GREY" "$RESET" "$GREY" "$(date '+%Y-%m-%d %H:%M:%S')" "$RESET"
}

section() { printf "\n%s%s▸ %s%s\n" "$BOLD" "$BLUE" "$1" "$RESET"; }

# run_step "label" command...
run_step() {
  local label="$1"; shift
  printf "  %s•%s %-46s" "$GREY" "$RESET" "$label"
  local out
  if out="$("$@" 2>&1)"; then
    printf "%s✔ pass%s\n" "$GREEN" "$RESET"
    PASS=$((PASS+1))
    return 0
  else
    printf "%s✗ fail%s\n" "$RED" "$RESET"
    FAIL=$((FAIL+1))
    FAILED_STEPS+=("$label")
    # Show a short tail of the error to aid debugging.
    printf "%s" "$DIM"
    echo "$out" | tail -n 8 | sed 's/^/      /'
    printf "%s" "$RESET"
    return 1
  fi
}

skip_step() {
  printf "  %s•%s %-46s%s— skipped%s\n" "$GREY" "$RESET" "$1" "$YELLOW" "$RESET"
  SKIP=$((SKIP+1))
}

# ----------------------------------------------------------------------------
# Checks
# ----------------------------------------------------------------------------
banner

# --- Environment -------------------------------------------------------------
section "Environment"
run_step "Python 3 available"            bash -c 'command -v python3'
run_step "Node.js available"             bash -c 'command -v node'
run_step "npm available"                 bash -c 'command -v npm'

# --- Backend -----------------------------------------------------------------
section "Backend (FastAPI)"
if [[ -d "$BACKEND_DIR" ]]; then
  run_step "Python files compile"        bash -c "cd '$BACKEND_DIR' && python3 -m py_compile \$(find app -name '*.py')"

  # App imports (catches missing deps / bad imports without starting a server)
  run_step "App imports cleanly"         bash -c "cd '$BACKEND_DIR' && DATABASE_URL='sqlite:////tmp/preflight_import.db' python3 -c 'import app.main' && rm -f /tmp/preflight_import.db"

  # Game-theory engine unit tests (no DB / no network)
  if python3 -c 'import pytest' >/dev/null 2>&1; then
    run_step "Engine unit tests (pytest)" bash -c "cd '$BACKEND_DIR' && python3 -m pytest tests/ -q"
  else
    run_step "Engine unit tests (fallback)" bash -c "cd '$BACKEND_DIR' && python3 - <<'PY'
import sys; sys.path.insert(0,'.')
from app.game_theory import allocate_knaster
r=allocate_knaster(agent_ids=[1,2],good_ids=[10,11],value={(1,10):1e5,(1,11):1e5,(2,10):1e5,(2,11):1e5},entitlement={1:.5,2:.5})
assert len(set(r.winner_by_good.values()))==2, 'tie should split'
assert sum(abs(v) for v in r.cash_by_agent.values())<1, 'tie should need no cash'
r=allocate_knaster(agent_ids=[1,2],good_ids=[10,11,12],value={(1,10):28e4,(1,11):2e4,(1,12):3e4,(2,10):19e4,(2,11):2e4,(2,12):7e4},entitlement={1:.5,2:.5})
adv=list(r.final_advantage_by_agent.values()); assert abs(adv[0]-adv[1])<.01, 'must be equitable'
assert abs(round(sum(r.cash_by_agent.values()),2))<.01, 'cash must net to zero'
print('engine ok')
PY"
  fi

  # Boot the server and probe a couple of endpoints
  run_step "Server boots & health OK"    bash -c "
    cd '$BACKEND_DIR'
    DATABASE_URL='sqlite:////tmp/preflight_boot.db' python3 -m uvicorn app.main:app --port 8077 >/tmp/preflight_uv.log 2>&1 &
    PID=\$!
    ok=1
    for i in \$(seq 1 20); do
      sleep 0.5
      if curl -fsS http://127.0.0.1:8077/health >/dev/null 2>&1; then ok=0; break; fi
    done
    # Probe that a protected route exists (401 expected, not 404)
    code=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8077/api/invitations || echo 000)
    kill \$PID >/dev/null 2>&1
    rm -f /tmp/preflight_boot.db
    [ \$ok -eq 0 ] || { echo 'health check failed'; cat /tmp/preflight_uv.log; exit 1; }
    [ \"\$code\" = '401' ] || { echo \"expected 401 from /api/invitations, got \$code\"; exit 1; }
    echo 'boot ok'
  "

  # Confirm the key route families are registered
  run_step "Core routes registered"      bash -c "
    cd '$BACKEND_DIR'
    DATABASE_URL='sqlite:////tmp/preflight_routes.db' python3 - <<'PY'
import os, json
from app.main import app
from fastapi.openapi.utils import get_openapi
spec=get_openapi(title='x',version='1',routes=app.routes)
paths=set(spec['paths'])
need=['/api/disputes','/api/disputes/{dispute_id}/reconciliation',
      '/api/disputes/{dispute_id}/mediation/slots',
      '/api/disputes/{dispute_id}/report','/api/invitations','/api/users/me']
missing=[p for p in need if p not in paths]
assert not missing, 'missing routes: %s' % missing
print('routes ok (%d total)' % len(paths))
PY
    rm -f /tmp/preflight_routes.db
  "

  # Security: no leaked secret, no committed DB
  run_step "No leaked App Password"      bash -c "! grep -rq 'wxdiifryzplxwyns' '$BACKEND_DIR' 2>/dev/null"
  run_step "No committed *.db file"      bash -c "[ -z \"\$(find '$ROOT_DIR' -name '*.db' -not -path '*/node_modules/*' 2>/dev/null)\" ]"
else
  skip_step "Backend directory not found"
fi

# --- Frontend ----------------------------------------------------------------
section "Frontend (React + Vite)"
if [[ -d "$FRONTEND_DIR" ]]; then
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    run_step "Install dependencies (npm)" bash -c "cd '$FRONTEND_DIR' && npm install --no-audit --no-fund --loglevel=error"
  else
    printf "  %s•%s %-46s%sup to date%s\n" "$GREY" "$RESET" "Dependencies present" "$GREEN" "$RESET"
  fi
  run_step "Type-check (tsc --noEmit)"   bash -c "cd '$FRONTEND_DIR' && npx tsc --noEmit"
  if [[ "$QUICK" == "1" ]]; then
    skip_step "Production build (--quick)"
  else
    run_step "Production build (vite)"   bash -c "cd '$FRONTEND_DIR' && npm run build"
  fi
  # i18n sanity: every language should define the same number of keys
  run_step "i18n key parity across langs" bash -c "
    cd '$FRONTEND_DIR'
    node - <<'JS'
const fs=require('fs');
const s=fs.readFileSync('src/i18n.tsx','utf8');
// crude per-language key count between '<lang>: {' headers
const langs=['en','it','sl','et','be','lt','hr'];
const counts={};
for(const l of langs){
  const re=new RegExp('\\\\n  '+l+': \\\\{');
  const i=s.search(re);
  if(i<0){console.error('missing lang',l);process.exit(1);}
  // slice to next top-level '  xx: {' or end
  const rest=s.slice(i+1);
  const next=rest.search(/\\n  [a-z]{2}: \\{/);
  const block= next>0 ? rest.slice(0,next) : rest;
  counts[l]=(block.match(/^\\s{4}[a-zA-Z0-9_]+:/gm)||[]).length;
}
const vals=Object.values(counts);
const min=Math.min(...vals), max=Math.max(...vals);
console.log('i18n key counts:', JSON.stringify(counts));
// allow small drift but flag big gaps
if(max-min>40){console.error('large i18n key drift'); process.exit(1);}
JS
  "
else
  skip_step "Frontend directory not found"
fi

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
printf "\n%s%s──────────────────────────────────────────────%s\n" "$BOLD" "$GREY" "$RESET"
printf "  %s%d passed%s   " "$GREEN" "$PASS" "$RESET"
printf "%s%d failed%s   " "$([ $FAIL -gt 0 ] && echo "$RED" || echo "$GREY")" "$FAIL" "$RESET"
printf "%s%d skipped%s\n" "$YELLOW" "$SKIP" "$RESET"

if [[ $FAIL -eq 0 ]]; then
  printf "\n  %s%s✔ PREFLIGHT PASSED%s — the platform is ready.\n\n" "$BOLD" "$GREEN" "$RESET"
  exit 0
else
  printf "\n  %s%s✗ PREFLIGHT FAILED%s — %d check(s) need attention:\n" "$BOLD" "$RED" "$RESET" "$FAIL"
  for st in "${FAILED_STEPS[@]}"; do printf "      %s- %s%s\n" "$RED" "$st" "$RESET"; done
  printf "\n"
  exit 1
fi
