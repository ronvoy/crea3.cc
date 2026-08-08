#!/usr/bin/env bash
# Batch localization for CREA3 — keeps every language in sync AND correct.
#
# TWO run modes:
#
#   ./localization.sh            (default, == --flagged)
#   ./localization.sh --flagged
#       FAST incremental pass. Scans for hardcoded strings, then translates only
#       keys that are NEW or whose English text CHANGED since the last run
#       (tracked in frontend/scripts/.i18n-manifest.json). Cheap; use after
#       editing a few pages.
#
#   ./localization.sh --fullsweep
#       WHOLE-DOCUMENT scan + verify + action + audit. Use to repair drift or
#       after big changes:
#         1. SCAN   — deep audit for hardcoded strings AND i18n-bypass patterns
#                     (page-local language dicts / `lang===` ternaries) across
#                     every page/route, incl. admin.
#         2. VERIFY — quality audit: keys present but never translated
#                     (identical to English) or truncated/bloated vs English.
#         3. ACTION — translate missing + changed + untranslated + suspect keys.
#         4. AUDIT  — re-run the quality audit to confirm the repair.
#
# Extra flags (either mode): --model=openai/gpt-4o-mini · --dry (preview, no write)
#   e.g. ./localization.sh --fullsweep --llm   # add LLM accuracy judge to audits
#
# Requires OPENROUTER_API_KEY (env or backend/.env) and node 18+.
set -euo pipefail
cd "$(dirname "$0")/frontend"

MODE="flagged"
LLM=""
PASS=()            # flags forwarded to the translator (--model, --dry, --limit)
for a in "$@"; do
  case "$a" in
    --fullsweep|--sweep) MODE="fullsweep" ;;
    --flagged) MODE="flagged" ;;
    --llm) LLM="--llm" ;;
    *) PASS+=("$a") ;;
  esac
done
fwd() { node "$@" ${PASS[@]+"${PASS[@]}"}; }

if [ "$MODE" = "fullsweep" ]; then
  echo "══ FULL SWEEP ═════════════════════════════════════════════════════════"
  echo "── 1/4  SCAN — hardcoded strings + i18n-bypass across all pages ──────"
  node scripts/i18n-scan.mjs --full --list || true
  echo ""
  echo "── 2/4  VERIFY — translation quality (untranslated / suspect) ────────"
  node scripts/i18n-audit.mjs $LLM || true
  echo ""
  echo "── 3/4  ACTION — translate missing + changed + untranslated + suspect ─"
  fwd scripts/i18n-translate.mjs all --sweep
  echo ""
  echo "── 4/4  AUDIT — re-verify translation quality after repair ───────────"
  node scripts/i18n-audit.mjs $LLM || true
  echo ""
  node scripts/i18n-coverage.mjs
else
  echo "══ FLAGGED (incremental) ══════════════════════════════════════════════"
  echo "── 1/3  Scanning for hardcoded strings that bypass i18n ──────────────"
  node scripts/i18n-scan.mjs || true
  echo ""
  echo "── 2/3  Translating NEW / CHANGED keys into every language ───────────"
  fwd scripts/i18n-translate.mjs all
  echo ""
  echo "── 3/3  Coverage report ──────────────────────────────────────────────"
  node scripts/i18n-coverage.mjs
fi

echo ""
echo "Done. If anything changed, rebuild the frontend (./run_be.sh or npm run build)."
