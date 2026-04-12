#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Circuit Breaker — State Manager for Parallel Dispatch
# Part of Forgewright Production Grade Plugin
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# Config
CIRCUIT_FILE="${CIRCUIT_FILE:-.forgewright/circuits.json}"
CIRCUIT_TIMEOUT="${CIRCUIT_TIMEOUT:-60}"  # seconds OPEN before HALF_OPEN
CIRCUIT_RECOVERY="${CIRCUIT_RECOVERY:-120}"  # seconds HALF_OPEN before CLOSED
CIRCUIT_THRESHOLD="${CIRCUIT_THRESHOLD:-3}"  # failures before OPEN

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[circuit]${NC} $*"; }
ok()  { echo -e "${GREEN}✓${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }

# ━━━ jq Fallback (pure bash) ━━━━━━━━━━━━━━━━━━━━━━━━━━

# Check if jq is available
has_jq() {
  command -v jq &>/dev/null
}

# JSON get value without jq (basic support)
json_get() {
  local file="$1"
  local key="$2"

  if [ ! -f "$file" ]; then
    echo "null"
    return
  fi

  if has_jq; then
    jq -r "${key}" "$file" 2>/dev/null || echo "null"
  else
    # Fallback: grep-based extraction (basic)
    local value
    value=$(grep -o "\"${key}\":[^,}]*" "$file" 2>/dev/null | head -1 | sed 's/.*://' | tr -d ' "')
    if [ -z "$value" ]; then
      echo "null"
    else
      echo "$value"
    fi
  fi
}

# JSON set value without jq (basic support)
json_set() {
  local file="$1"
  local key="$2"
  local value="$3"

  if has_jq; then
    local temp
    temp=$(mktemp)
    jq --arg k "$key" --arg v "$value" \
      'setpath(split($k; "."); $v)' \
      "$file" > "$temp" && mv "$temp" "$file"
  else
    # Fallback: sed-based replacement (basic, for simple cases)
    if grep -q "\"${key}\":" "$file" 2>/dev/null; then
      sed -i '' "s/\"${key}\":[^,]*/\"${key}\": ${value}/" "$file"
    fi
  fi
}

# ━━━ State Management ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

load_state() {
  local key="$1"
  local field="${2:-state}"

  if [ ! -f "$CIRCUIT_FILE" ]; then
    echo "CLOSED"
    return
  fi

  local state
  state=$(json_get "$CIRCUIT_FILE" "$key.state")
  
  case "$state" in
    CLOSED|OPEN|HALF_OPEN)
      echo "$state"
      ;;
    *)
      echo "CLOSED"
      ;;
  esac
}

load_failures() {
  local key="$1"
  json_get "$CIRCUIT_FILE" "$key.failure_count" | grep -E '^[0-9]+$' || echo "0"
}

load_last_failure() {
  local key="$1"
  json_get "$CIRCUIT_FILE" "$key.last_failure" | grep -E '^[0-9]+$' || echo "0"
}

load_successes() {
  local key="$1"
  json_get "$CIRCUIT_FILE" "$key.success_count" | grep -E '^[0-9]+$' || echo "0"
}

# ━━━ Core Functions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

should_allow() {
  local key="$1"
  local timeout="${2:-$CIRCUIT_TIMEOUT}"

  local state
  state=$(load_state "$key")
  local last_failure
  last_failure=$(load_last_failure "$key")
  local now
  now=$(date +%s)
  local elapsed=$((now - last_failure))

  case "$state" in
    CLOSED)
      echo "CLOSED"
      return 0
      ;;
    OPEN)
      if [ "$last_failure" -eq 0 ] || [ "$last_failure" -eq 1 ]; then
        echo "CLOSED"
        return 0
      fi
      if [ $elapsed -ge $timeout ]; then
        log "$key: OPEN → HALF_OPEN (timeout ${elapsed}s >= ${timeout}s)"
        set_state "$key" "HALF_OPEN"
        echo "HALF_OPEN"
        return 0
      fi
      echo "OPEN"
      return 1
      ;;
    HALF_OPEN)
      echo "HALF_OPEN"
      return 0
      ;;
  esac

  echo "CLOSED"
  return 0
}

record_success() {
  local key="$1"

  mkdir -p "$(dirname "$CIRCUIT_FILE")"

  local state
  state=$(load_state "$key")
  local successes
  successes=$(load_successes "$key")

  if [ "$state" = "HALF_OPEN" ]; then
    successes=$((successes + 1))
    if [ $successes -ge 2 ]; then
      log "$key: HALF_OPEN → CLOSED (2 successes)"
      set_state "$key" "CLOSED"
      set_failures "$key" 0
      set_successes "$key" 0
    else
      set_successes "$key" "$successes"
    fi
  else
    set_state "$key" "CLOSED"
    set_failures "$key" 0
    set_successes "$key" 0
  fi

  ok "$key: success recorded"
}

record_failure() {
  local key="$1"
  local threshold="${2:-$CIRCUIT_THRESHOLD}"

  mkdir -p "$(dirname "$CIRCUIT_FILE")"

  local state
  state=$(load_state "$key")
  local failures
  failures=$(load_failures "$key")
  local now
  now=$(date +%s)

  failures=$((failures + 1))

  if [ "$state" = "HALF_OPEN" ]; then
    warn "$key: HALF_OPEN → OPEN (failure $failures)"
    set_state "$key" "OPEN"
    set_failures "$key" "$failures"
    set_last_failure "$key" "$now"
  elif [ $failures -ge $threshold ]; then
    warn "$key: CLOSED → OPEN (failures: $failures >= $threshold)"
    set_state "$key" "OPEN"
    set_failures "$key" "$failures"
    set_last_failure "$key" "$now"
  else
    set_state "$key" "CLOSED"
    set_failures "$key" "$failures"
    set_last_failure "$key" "$now"
  fi

  err "$key: failure recorded (total: $failures)"
}

# ━━━ State Setters ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set_state() {
  local key="$1"
  local value="$2"
  _set_field "$key" "state" "\"$value\""
}

set_failures() {
  local key="$1"
  local value="$2"
  _set_field "$key" "failure_count" "$value"
}

set_last_failure() {
  local key="$1"
  local value="$2"
  _set_field "$key" "last_failure" "$value"
}

set_successes() {
  local key="$1"
  local value="$2"
  _set_field "$key" "success_count" "$value"
}

_set_field() {
  local key="$1"
  local field="$2"
  local value="$3"

  mkdir -p "$(dirname "$CIRCUIT_FILE")"

  if [ ! -f "$CIRCUIT_FILE" ]; then
    echo "{}" > "$CIRCUIT_FILE"
  fi

  if has_jq; then
    local temp
    temp=$(mktemp)
    jq --arg k "$key" --arg f "$field" --argjson v "$value" \
      'setpath(split($k; ".") + [$f]; $v)' \
      "$CIRCUIT_FILE" > "$temp" && mv "$temp" "$CIRCUIT_FILE"
  else
    # Fallback: direct file manipulation
    # This is a simplified version - for production, use jq
    if grep -q "\"${key}\":" "$CIRCUIT_FILE" 2>/dev/null; then
      # Key exists, update field
      if grep -q "\"${field}\":" "$CIRCUIT_FILE" 2>/dev/null; then
        sed -i '' "s/\"${field}\":[[:space:]]*[^,]*/\"${field}\": ${value}/" "$CIRCUIT_FILE"
      else
        # Field doesn't exist in key object - append
        warn "jq not available, using basic fallback"
      fi
    else
      # Key doesn't exist - add it
      local temp
      temp=$(mktemp)
      jq --arg k "$key" --arg f "$field" --argjson v "$value" \
        'setpath(split($k; ".") + [$f]; $v)' \
        "$CIRCUIT_FILE" > "$temp" && mv "$temp" "$CIRCUIT_FILE"
    fi
  fi
}

# ━━━ Commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd_check() {
  local key="$1"
  local timeout="${2:-$CIRCUIT_TIMEOUT}"

  local state
  state=$(should_allow "$key" "$timeout")

  if [ "$state" = "OPEN" ]; then
    err "$key: circuit is OPEN (blocked)"
    return 1
  elif [ "$state" = "HALF_OPEN" ]; then
    warn "$key: circuit is HALF_OPEN (limited)"
  else
    ok "$key: circuit is CLOSED (allowed)"
  fi

  return 0
}

cmd_status() {
  echo ""
  echo "━━━ Circuit Breaker Status ━━━━━━━━━━━━━━━━━━━━━"

  if [ ! -f "$CIRCUIT_FILE" ]; then
    log "No circuits found (file not created)"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    return
  fi

  if has_jq; then
    jq -r 'to_entries[] | "\(.key): \(.value.state) (failures: \(.value.failure_count))"' \
      "$CIRCUIT_FILE" 2>/dev/null || cat "$CIRCUIT_FILE"
  else
    cat "$CIRCUIT_FILE"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_reset() {
  local key="$1"

  if [ -f "$CIRCUIT_FILE" ]; then
    if has_jq; then
      jq --arg k "$key" 'delpaths([[split($k; ".")]])' \
        "$CIRCUIT_FILE" > "$CIRCUIT_FILE.tmp" && mv "$CIRCUIT_FILE.tmp" "$CIRCUIT_FILE"
    else
      warn "jq not available, cannot reset circuit without manual edit"
    fi
  fi

  ok "$key: circuit reset"
}

cmd_test() {
  local key="${1:-test-circuit}"

  log "Running circuit breaker test..."

  # Reset
  cmd_reset "$key" 2>/dev/null || true

  # Test 1: Initial state
  echo ""
  echo "Test 1: Initial state (should be CLOSED)"
  cmd_check "$key"

  # Test 2: Record failures
  echo ""
  echo "Test 2: Record $CIRCUIT_THRESHOLD failures"
  for i in $(seq 1 "$CIRCUIT_THRESHOLD"); do
    record_failure "$key" "$CIRCUIT_THRESHOLD"
  done

  # Test 3: Should be OPEN
  echo ""
  echo "Test 3: Should be OPEN (blocked)"
  cmd_check "$key" || true

  # Test 4: Reset and success
  echo ""
  echo "Test 4: Reset and record successes"
  cmd_reset "$key"
  record_success "$key"
  record_success "$key"

  # Cleanup
  cmd_reset "$key"

  echo ""
  ok "Circuit breaker test complete"
}

# ━━━ Usage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

usage() {
  cat <<EOF

  Usage: circuit-breaker.sh <command> [args]

  Commands:
    check <key> [timeout]    Check if circuit allows requests
    status                   Show all circuit states
    success <key>            Record success for circuit
    failure <key> [threshold] Record failure for circuit
    reset <key>              Reset circuit to CLOSED
    test [key]               Run circuit breaker test

  Environment:
    CIRCUIT_FILE      Circuit state file (default: .forgewright/circuits.json)
    CIRCUIT_TIMEOUT   Seconds OPEN before HALF_OPEN (default: 60)
    CIRCUIT_THRESHOLD Failures before OPEN (default: 3)

  Examples:
    ./scripts/circuit-breaker.sh check t3a
    ./scripts/circuit-breaker.sh failure t3a 3
    ./scripts/circuit-breaker.sh status
    ./scripts/circuit-breaker.sh test

EOF
}

# ━━━ Main dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
  local cmd="${1:-}"

  case "$cmd" in
    check)    shift; cmd_check "$@" ;;
    status)   cmd_status ;;
    success)  shift; record_success "$1" ;;
    failure)  shift; record_failure "$@" ;;
    reset)    shift; cmd_reset "$@" ;;
    test)     shift; cmd_test "$@" ;;
    help|--help|-h|"") usage ;;
    *)        err "Unknown command: $cmd"; usage; exit 1 ;;
  esac
}

main "$@"
