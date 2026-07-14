#!/usr/bin/env bash
# scripts/lite/telemetry.sh
# Forgewright Phase 1 — telemetry foundation.
# Append-only JSONL event stream + monthly aggregate report.
#
# Usage:
#   bash scripts/lite/telemetry.sh emit <event_type> <json_payload>
#   bash scripts/lite/telemetry.sh report [YYYYMM]
#
# Storage: .forgewright/telemetry/events-YYYYMM.jsonl
# Record:  {"ts":"<ISO-8601 UTC>","event":"<type>","data":{...}}
#
# Exit codes:
#   0 — success
#   1 — usage error / invalid payload / missing dependency

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[TELEMETRY]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[TELEMETRY] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[TELEMETRY] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

TELEMETRY_DIR="${FORGEWRIGHT_TELEMETRY_DIR:-.forgewright/telemetry}"

command -v jq >/dev/null 2>&1 || { log_error "jq is required but not found in PATH."; exit 1; }

usage() {
  cat >&2 <<'EOF'
Usage:
  telemetry.sh emit <event_type> <json_payload>   Append one event
  telemetry.sh report [YYYYMM]                    Aggregate one month (default: current UTC month)
EOF
  exit 1
}

cmd_emit() {
  [[ $# -eq 2 ]] || usage
  local event_type="$1" payload="$2"

  if [[ ! "$event_type" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid event_type '${event_type}' (allowed: letters, digits, '.', '_', '-')."
    exit 1
  fi

  local ts month file record
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  month="$(date -u +'%Y%m')"
  file="${TELEMETRY_DIR}/events-${month}.jsonl"

  # jq validates the payload and builds the envelope in one pass.
  if ! record="$(printf '%s' "$payload" \
      | jq -c --arg ts "$ts" --arg event "$event_type" \
           '{ts: $ts, event: $event, data: .}' 2>/dev/null)"; then
    log_error "Payload is not valid JSON: ${payload}"
    exit 1
  fi

  mkdir -p "$TELEMETRY_DIR"
  printf '%s\n' "$record" >> "$file"
  log_info "emit ${event_type} → ${file}"
}

cmd_report() {
  local month="${1:-$(date -u +'%Y%m')}"
  if [[ ! "$month" =~ ^[0-9]{6}$ ]]; then
    log_error "Month must be YYYYMM, got: ${month}"
    exit 1
  fi

  local file="${TELEMETRY_DIR}/events-${month}.jsonl"
  if [[ ! -s "$file" ]]; then
    log_warn "No events recorded for ${month} (${file} missing or empty)."
    exit 0
  fi

  echo "── Telemetry report: ${month} ─────────────────────────────"
  echo "File:         ${file}"
  echo "Total events: $(wc -l < "$file" | tr -d ' ')"
  echo ""
  echo "By event type:"
  jq -r '.event' "$file" | sort | uniq -c | sort -rn \
    | awk '{printf "  %-32s %s\n", $2, $1}'
  echo ""
  echo "By day:"
  jq -r '.ts[0:10]' "$file" | sort | uniq -c \
    | awk '{printf "  %-12s %s\n", $2, $1}'
  echo ""
  echo "First event: $(jq -r '.ts' "$file" | sort | head -1)"
  echo "Last event:  $(jq -r '.ts' "$file" | sort | tail -1)"
}

[[ $# -ge 1 ]] || usage
cmd="$1"; shift
case "$cmd" in
  emit)   cmd_emit "$@" ;;
  report) cmd_report "$@" ;;
  *)      usage ;;
esac
