#!/usr/bin/env bash
# scripts/lite/rule-ledger.sh
# Forgewright Phase 1 — rule ledger.
# Tracks per-rule enforcement events so the kernel can measure which
# Hard Rules actually fire and which get violated.
#
# Usage:
#   bash scripts/lite/rule-ledger.sh add <rule_id> <outcome> [note...]
#   bash scripts/lite/rule-ledger.sh stats
#   bash scripts/lite/rule-ledger.sh top [N]
#
# Storage: .forgewright/rule-ledger.jsonl
# Record:  {"ts":"<ISO-8601 UTC>","rule":"<id>","outcome":"<outcome>","note":"..."}
# Recommended outcomes: hit | violation | override | waived
#
# Exit codes:
#   0 — success
#   1 — usage error / missing dependency

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[RULE-LEDGER]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[RULE-LEDGER] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[RULE-LEDGER] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

LEDGER_FILE="${FORGEWRIGHT_RULE_LEDGER:-.forgewright/rule-ledger.jsonl}"

command -v jq >/dev/null 2>&1 || { log_error "jq is required but not found in PATH."; exit 1; }

usage() {
  cat >&2 <<'EOF'
Usage:
  rule-ledger.sh add <rule_id> <outcome> [note...]   Record one enforcement event
  rule-ledger.sh stats                               Per-rule totals with outcome breakdown
  rule-ledger.sh top [N]                             Top N rules by event count (default 5)

Recommended outcomes: hit | violation | override | waived
EOF
  exit 1
}

_require_ledger() {
  if [[ ! -s "$LEDGER_FILE" ]]; then
    log_warn "Ledger is empty (${LEDGER_FILE} missing or empty)."
    exit 0
  fi
}

cmd_add() {
  [[ $# -ge 2 ]] || usage
  local rule_id="$1" outcome="$2"
  shift 2
  local note="$*"

  if [[ ! "$rule_id" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid rule_id '${rule_id}' (allowed: letters, digits, '.', '_', '-')."
    exit 1
  fi
  if [[ ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome '${outcome}' (allowed: letters, digits, '.', '_', '-')."
    exit 1
  fi

  local ts record
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  record="$(jq -cn --arg ts "$ts" --arg rule "$rule_id" \
                   --arg outcome "$outcome" --arg note "$note" \
                   '{ts: $ts, rule: $rule, outcome: $outcome, note: $note}')"

  mkdir -p "$(dirname "$LEDGER_FILE")"
  printf '%s\n' "$record" >> "$LEDGER_FILE"
  log_info "add ${rule_id} [${outcome}] → ${LEDGER_FILE}"
}

cmd_stats() {
  _require_ledger
  echo "── Rule ledger stats ──────────────────────────────────────"
  echo "File:          ${LEDGER_FILE}"
  echo "Total entries: $(wc -l < "$LEDGER_FILE" | tr -d ' ')"
  echo ""
  echo "Per rule (count, outcome breakdown):"
  jq -sr '
    group_by(.rule) | sort_by(-length) | .[]
    | "\(.[] | .rule)\t\(length)\t\([group_by(.outcome)[] | "\(.[] | .outcome)=\(length)"] | join(", "))"
  ' "$LEDGER_FILE" | awk -F'\t' '{printf "  %-28s %4s  %s\n", $1, $2, $3}'
}

cmd_top() {
  local n="${1:-5}"
  if [[ ! "$n" =~ ^[0-9]+$ ]]; then
    log_error "N must be a positive integer, got: ${n}"
    exit 1
  fi
  _require_ledger
  echo "── Top ${n} rules by event count ──────────────────────────"
  jq -sr '
    group_by(.rule) | map({rule: (.[0].rule), n: length})
    | sort_by(-.n) | .[] | "\(.n)\t\(.rule)"
  ' "$LEDGER_FILE" | head -n "$n" | awk -F'\t' '{printf "  %4s  %s\n", $1, $2}'
}

[[ $# -ge 1 ]] || usage
cmd="$1"; shift
case "$cmd" in
  add)   cmd_add "$@" ;;
  stats) cmd_stats "$@" ;;
  top)   cmd_top "$@" ;;
  *)     usage ;;
esac
