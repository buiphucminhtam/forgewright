#!/usr/bin/env bash
# scripts/lite/rule-ledger.sh
# Forgewright Phase 1 — rule ledger.
# Tracks per-rule enforcement events so the kernel can measure which
# Hard Rules actually fire and which get violated.
#
# Usage:
#   bash scripts/lite/rule-ledger.sh add <rule_id> <outcome> [note...]
#   bash scripts/lite/rule-ledger.sh stats
#   bash scripts/lite/rule-ledger.sh top [N] [outcome]
#   bash scripts/lite/rule-ledger.sh recent [N] [outcome]
#   bash scripts/lite/rule-ledger.sh recurring [MIN] [DAYS]
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
if [[ -n "${FORGEWRIGHT_WORKSPACE:-}" ]]; then
  WORKSPACE_PATH="$FORGEWRIGHT_WORKSPACE"
  if command -v cygpath >/dev/null 2>&1; then
    WORKSPACE_PATH="$(cygpath -u "$WORKSPACE_PATH" 2>/dev/null)" || {
      log_error "FORGEWRIGHT_WORKSPACE cannot be normalized."
      exit 1
    }
  fi
  if [[ ! -d "$WORKSPACE_PATH" ]]; then
    log_error "FORGEWRIGHT_WORKSPACE is not a readable directory."
    exit 1
  fi
  PROJECT_ROOT="$(cd "$WORKSPACE_PATH" 2>/dev/null && pwd -P)" || {
    log_error "FORGEWRIGHT_WORKSPACE cannot be resolved."
    exit 1
  }
fi
cd "$PROJECT_ROOT"

LEDGER_FILE="${FORGEWRIGHT_RULE_LEDGER:-.forgewright/rule-ledger.jsonl}"

HAS_JQ=0
command -v jq >/dev/null 2>&1 && HAS_JQ=1
PYTHON_BIN=""
if [[ "$HAS_JQ" -eq 0 ]]; then
  PYTHON_BIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
  [[ -n "$PYTHON_BIN" ]] || { log_error "jq or python is required but not found in PATH."; exit 1; }
fi

ACTIVE_LOCK_DIR=""
_release_lock() {
  if [[ -n "$ACTIVE_LOCK_DIR" && -d "$ACTIVE_LOCK_DIR" ]]; then
    rmdir "$ACTIVE_LOCK_DIR" 2>/dev/null || true
  fi
  ACTIVE_LOCK_DIR=""
}

_append_locked() {
  local file="$1" record="$2" attempts=0 max_attempts=100
  mkdir -p "$(dirname "$file")"
  ACTIVE_LOCK_DIR="${file}.lock"
  while ! mkdir "$ACTIVE_LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge "$max_attempts" ]]; then
      log_error "Timed out waiting for ledger append lock."
      ACTIVE_LOCK_DIR=""
      return 1
    fi
    sleep 0.02
  done
  trap _release_lock EXIT HUP INT TERM
  if ! printf '%s\n' "$record" >> "$file"; then
    _release_lock
    trap - EXIT HUP INT TERM
    return 1
  fi
  _release_lock
  trap - EXIT HUP INT TERM
}

usage() {
  cat >&2 <<'EOF'
Usage:
  rule-ledger.sh add <rule_id> <outcome> [note...]   Record one enforcement event
  rule-ledger.sh stats                               Per-rule totals with outcome breakdown
  rule-ledger.sh top [N] [outcome]                   Top N rules, optionally filtered
  rule-ledger.sh recent [N] [outcome]                Most recent events (default: violation)
  rule-ledger.sh recurring [MIN] [DAYS]              Violation classes seen MIN+ times in DAYS
                                                     (default 3, 14): propose a check

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
  if [[ "$HAS_JQ" -eq 1 ]]; then
    record="$(jq -cn --arg ts "$ts" --arg rule "$rule_id" \
                     --arg outcome "$outcome" --arg note "$note" \
                     '{ts: $ts, rule: $rule, outcome: $outcome, note: $note}')"
  else
    record="$("$PYTHON_BIN" -c 'import json,sys; print(json.dumps({"ts":sys.argv[1],"rule":sys.argv[2],"outcome":sys.argv[3],"note":sys.argv[4]},separators=(",",":")))' "$ts" "$rule_id" "$outcome" "$note")"
  fi

  _append_locked "$LEDGER_FILE" "$record"
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
  local outcome="${2:-}"
  if [[ ! "$n" =~ ^[1-9][0-9]*$ ]]; then
    log_error "N must be a positive integer, got: ${n}"
    exit 1
  fi
  if [[ -n "$outcome" && ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome filter: ${outcome}"
    exit 1
  fi
  _require_ledger
  echo "── Top ${n} rules by event count${outcome:+ [${outcome}]} ──────────────────────────"
  jq -sr --arg outcome "$outcome" '
    map(select($outcome == "" or .outcome == $outcome))
    | group_by(.rule) | map({rule: (.[0].rule), n: length})
    | sort_by(-.n) | .[] | "\(.n)\t\(.rule)"
  ' "$LEDGER_FILE" | head -n "$n" | awk -F'\t' '{printf "  %4s  %s\n", $1, $2}'
}

cmd_recent() {
  local n="${1:-5}"
  local outcome="${2:-violation}"
  if [[ ! "$n" =~ ^[1-9][0-9]*$ ]]; then
    log_error "N must be a positive integer, got: ${n}"
    exit 1
  fi
  if [[ -n "$outcome" && ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome filter: ${outcome}"
    exit 1
  fi
  _require_ledger
  echo "── Recent ${n} ${outcome:-all} rule events ──────────────────────────"
  jq -sr --arg outcome "$outcome" --argjson n "$n" '
    map(select($outcome == "" or .outcome == $outcome))
    | sort_by(.ts) | reverse | .[:$n][]
    | [.ts, .rule, .outcome, .note] | @tsv
  ' "$LEDGER_FILE" | awk -F'\t' '{printf "  %s  %-24s %-12s %s\n", $1, $2, $3, $4}'
}

cmd_recurring() {
  local minimum="${1:-3}" days="${2:-14}" py
  if [[ ! "$minimum" =~ ^[1-9][0-9]{0,5}$ ]]; then
    log_error "MIN must be an integer from 1 to 999999, got: ${minimum}"
    exit 1
  fi
  if [[ ! "$days" =~ ^[1-9][0-9]{0,4}$ ]]; then
    log_error "DAYS must be an integer from 1 to 99999, got: ${days}"
    exit 1
  fi
  py="${PYTHON_BIN:-$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)}"
  [[ -n "$py" ]] || { log_error "python is required for recurring but not found in PATH."; exit 1; }
  _require_ledger
  # A class is a violation note with digests, quoted values, timestamps and
  # numbers normalised away, so repeats of one failure group together.
  "$py" - "$LEDGER_FILE" "$minimum" "$days" <<'PY_RECURRING'
import json
import re
import sys
from datetime import datetime, timedelta, timezone

path, minimum, days = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
cutoff = datetime.now(timezone.utc) - timedelta(days=days)
normalizers = (
    (re.compile(r"'[^']*'"), "'…'"),
    (re.compile(r'"[^"]*"'), '"…"'),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}T[0-9:.]+Z?"), "<ts>"),
    (re.compile(r"\b[0-9a-fA-F]{8,}\b"), "<hex>"),
    (re.compile(r"\d+(?:\.\d+)?"), "N"),
    (re.compile(r"\s+"), " "),
)
control = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def inert(text):
    """Keep ledger text from moving the cursor or forging extra lines."""
    return control.sub("?", text)


groups = {}
with open(path, encoding="utf-8", errors="replace") as stream:
    for line in stream:
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get("outcome") != "violation":
            continue
        rule, stamp = event.get("rule"), event.get("ts")
        if not isinstance(rule, str) or not isinstance(stamp, str):
            continue
        try:
            when = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        if when < cutoff:
            continue
        note = event.get("note") if isinstance(event.get("note"), str) else ""
        for pattern, replacement in normalizers:
            note = pattern.sub(replacement, note)
        key = (rule, note.strip()[:160])
        entry = groups.setdefault(key, [0, when, when])
        entry[0] += 1
        entry[1] = min(entry[1], when)
        entry[2] = max(entry[2], when)

recurring = sorted(
    ((count, rule, note, first, last) for (rule, note), (count, first, last) in groups.items() if count >= minimum),
    key=lambda item: (-item[0], item[1], item[2]),
)
print(f"── Recurring violations ({minimum}+ in {days}d) ──────────────────────────")
if not recurring:
    print(f"  No violation class recurred {minimum}+ times in the last {days} days.")
for count, rule, note, first, last in recurring:
    span = f"{first:%Y-%m-%d}..{last:%Y-%m-%d}"
    print(f"  PROPOSE CHECK  {inert(rule)} x{count}  {span}  {inert(note)}")
if recurring:
    print(
        "  Encode each class as a deterministic check (lint, test, hook) or a design"
        " that removes the wrong choice, not another prose rule."
    )
PY_RECURRING
}

[[ $# -ge 1 ]] || usage
cmd="$1"; shift
case "$cmd" in
  add)   cmd_add "$@" ;;
  stats) cmd_stats "$@" ;;
  top)   cmd_top "$@" ;;
  recent) cmd_recent "$@" ;;
  recurring) cmd_recurring "$@" ;;
  *)     usage ;;
esac
