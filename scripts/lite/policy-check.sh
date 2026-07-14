#!/usr/bin/env bash
# scripts/lite/policy-check.sh
# Forgewright Phase 4 — execution policy gate.
# Reads .forgewright/execution-policy.yaml and checks tool arguments against
# deny_patterns. Designed to be called from guard middleware ④ before a tool
# call executes. See kernel/POLICY.md.
#
# Usage:
#   bash scripts/lite/policy-check.sh check <tool_name> [tool_args...]
#   bash scripts/lite/policy-check.sh get <key>
#   bash scripts/lite/policy-check.sh show
#
# Keys for `get`: mode | require_verify | max_escalations | refresh_interval_ticks
#
# Exit codes:
#   0 — ALLOW (also: audit-mode match, or policy file absent = bootstrap mode)
#   1 — DENY  (pattern matched, mode=strict or unknown mode)
#   2 — WARN  (pattern matched, mode=permissive)
#   3 — usage error / missing dependency

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[POLICY]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[POLICY] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[POLICY] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

POLICY_FILE="${FORGEWRIGHT_POLICY_FILE:-.forgewright/execution-policy.yaml}"
TELEMETRY_SH="${SCRIPT_DIR}/telemetry.sh"

usage() {
  cat >&2 <<'EOF'
Usage:
  policy-check.sh check <tool_name> [tool_args...]   Gate a tool call
  policy-check.sh get <key>                          Read one policy scalar
  policy-check.sh show                               Dump effective policy
EOF
  exit 3
}

# Best-effort telemetry — must never fail the gate.
_emit() {
  [[ -f "$TELEMETRY_SH" ]] || return 0
  bash "$TELEMETRY_SH" emit "$1" "$2" >/dev/null 2>&1 || true
}

# Extract a scalar value: `key: value   # comment` → `value`.
# Values must not contain spaces (documented in the policy file header).
_scalar() {
  (grep -E "^${1}:" "$POLICY_FILE" 2>/dev/null || true) \
    | head -1 | cut -d':' -f2- | cut -d'#' -f1 | tr -d ' \t"'
}

# Extract deny_patterns list items: `  - "pattern"` → `pattern`.
# deny_patterns is the only list in this file, so any `- ` line belongs to it.
_deny_patterns() {
  (grep -E '^[[:space:]]*- ' "$POLICY_FILE" 2>/dev/null || true) \
    | tr -d '"' | sed 's/^[[:space:]]*- //'
}

_default_for() {
  case "$1" in
    mode)                    echo "strict" ;;
    require_verify)          echo "true" ;;
    max_escalations)         echo "3" ;;
    refresh_interval_ticks)  echo "10" ;;
    *)                       echo "" ;;
  esac
}

cmd_get() {
  [[ $# -eq 1 ]] || usage
  local key="$1"
  local default
  default="$(_default_for "$key")"
  if [[ -z "$default" ]]; then
    log_error "Unknown policy key: ${key}"
    exit 3
  fi
  local value
  value="$(_scalar "$key")"
  echo "${value:-$default}"
}

cmd_show() {
  echo "── Effective execution policy ─────────────────────────────"
  echo "File: ${POLICY_FILE} $([[ -f "$POLICY_FILE" ]] && echo '(present)' || echo '(MISSING — built-in defaults)')"
  local key
  for key in mode require_verify max_escalations refresh_interval_ticks; do
    printf "  %-24s %s\n" "$key" "$(cmd_get "$key")"
  done
  echo "  deny_patterns:"
  _deny_patterns | while IFS= read -r p; do
    [[ -n "$p" ]] && printf "    - %s\n" "$p"
  done
}

cmd_check() {
  [[ $# -ge 1 ]] || usage
  local tool="$1"
  shift
  local args="$*"
  local subject="${tool} ${args}"

  if [[ ! -f "$POLICY_FILE" ]]; then
    # Bootstrap mode: no policy file yet — allow, but leave a trace.
    log_warn "Policy file ${POLICY_FILE} not found — ALLOW (bootstrap mode)."
    _emit "policy.nofile" "$(jq -cn --arg tool "$tool" '{tool: $tool}')"
    exit 0
  fi

  local mode
  mode="$(_scalar mode)"
  mode="${mode:-strict}"

  local matched=""
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if printf '%s' "$subject" | grep -Eiq -- "$pattern"; then
      matched="$pattern"
      break
    fi
  done < <(_deny_patterns)

  if [[ -z "$matched" ]]; then
    log_info "ALLOW ${tool}"
    exit 0
  fi

  local payload
  payload="$(jq -cn --arg tool "$tool" --arg pattern "$matched" --arg mode "$mode" \
                    '{tool: $tool, pattern: $pattern, mode: $mode}')"

  case "$mode" in
    permissive)
      _emit "policy.warn" "$payload"
      log_warn "WARN ${tool}: args match deny pattern [${matched}] — allowed (mode=permissive)."
      exit 2
      ;;
    audit)
      _emit "policy.audit" "$payload"
      log_info "AUDIT ${tool}: args match deny pattern [${matched}] — logged only (mode=audit)."
      exit 0
      ;;
    strict|*)
      # Unknown modes fail closed.
      _emit "policy.deny" "$payload"
      log_error "DENY ${tool}: args match deny pattern [${matched}] (mode=${mode})."
      exit 1
      ;;
  esac
}

command -v jq >/dev/null 2>&1 || { log_error "jq is required but not found in PATH."; exit 3; }

[[ $# -ge 1 ]] || usage
cmd="$1"; shift
case "$cmd" in
  check) cmd_check "$@" ;;
  get)   cmd_get "$@" ;;
  show)  cmd_show "$@" ;;
  *)     usage ;;
esac
