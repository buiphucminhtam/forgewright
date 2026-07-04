#!/usr/bin/env bash
# scripts/lite/verify-gate.sh
# Forgewright turn-completion verify-gate.
# Works on macOS and Linux/Git-Bash.
#
# Shared contract:
#   Hook configs and CI call:
#     bash scripts/lite/verify-gate.sh --platform claude|gemini|cursor|codex
#   with the platform hook JSON payload on stdin.
#
# Platform payload (stdin JSON) fields consumed:
#   response_content  - AI response text (to check for VERIFY block)
#   turn              - optional turn/session ID (forwarded to evidence lookup)
#   files             - optional array of changed file paths
#
# Exit codes:
#   0 — gate OPEN (all checks passed or no code changes)
#   1 — gate BLOCKED (see stderr for reason)

set -uo pipefail

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[VERIFY-GATE]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[VERIFY-GATE] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[VERIFY-GATE] ERROR:${NC} $*" >&2; }

# ── resolve project root (dynamic, no hardcoded repo) ─────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CALLER_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$CALLER_ROOT" ]]; then
  PROJECT_ROOT="$CALLER_ROOT"
else
  PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
fi
cd "${PROJECT_ROOT}"

# ── parse --platform flag and any other flags ─────────────────────────────────
PLATFORM=""
PAYLOAD_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="${2:-}"
      shift 2
      ;;
    --payload-file)
      PAYLOAD_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      grep '^#' "${BASH_SOURCE[0]}" | head -30 | sed 's/^# \?//'
      exit 0
      ;;
    *)
      log_warn "Unknown flag: $1 (ignored)"
      shift
      ;;
  esac
done

# Validate platform
VALID_PLATFORMS=("claude" "gemini" "cursor" "codex" "")
PLATFORM_VALID=0
for p in "${VALID_PLATFORMS[@]}"; do
  [[ "$PLATFORM" == "$p" ]] && PLATFORM_VALID=1 && break
done
if [[ "$PLATFORM_VALID" -eq 0 ]]; then
  log_error "Unknown platform '${PLATFORM}'. Valid: claude, gemini, cursor, codex"
  exit 1
fi

[[ -n "$PLATFORM" ]] && log_info "Platform: ${PLATFORM}"

# ── read and parse stdin JSON payload (with loop cap) ─────────────────────────
RESPONSE_CONTENT=""
TURN_FROM_PAYLOAD=""
FILES_FROM_PAYLOAD=()

read_payload() {
  local raw_json=""
  if [[ -n "$PAYLOAD_FILE" && -f "$PAYLOAD_FILE" ]]; then
    raw_json="$(cat "$PAYLOAD_FILE")"
  elif [[ ! -t 0 ]]; then
    # Read stdin with a 1 MB cap. dd handles payloads without trailing newline
    # and avoids Bash 3.2 read -N edge cases under subprocess-provided stdin.
    raw_json="$(dd bs=1048576 count=1 2>/dev/null || true)"
    if [[ ${#raw_json} -ge 1048576 ]]; then
      log_warn "Stdin JSON payload truncated at 1 MB"
    fi
  fi

  if [[ -z "$raw_json" ]]; then
    return 0  # No payload — that's fine
  fi

  # Parse JSON fields using Python (handles unicode, nested keys, arrays)
  local parsed
  parsed="$(python3 - "${raw_json}" <<'PYEOF'
import json, sys, os

raw = sys.argv[1] if len(sys.argv) > 1 else ''
if not raw.strip():
    sys.exit(0)

try:
    payload = json.loads(raw)
except json.JSONDecodeError:
    # Tolerate non-JSON payloads (treat as plain response text)
    payload = {"response_content": raw}

fields = {
    "response_content": payload.get("response_content", payload.get("content", "")),
    "turn":             payload.get("turn", payload.get("turn_id", "")),
    "files":            payload.get("files", payload.get("changed_files", [])),
}
# Normalize files to newline-separated string for easy bash consumption
files_str = "\n".join(str(f) for f in fields["files"] if f)
print(json.dumps({
    "response_content": fields["response_content"],
    "turn":             fields["turn"],
    "files_str":        files_str,
}))
PYEOF
)" || true

  if [[ -n "$parsed" ]]; then
    RESPONSE_CONTENT="$(  echo "$parsed" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('response_content',''))")"
    TURN_FROM_PAYLOAD="$( echo "$parsed" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('turn',''))")"
    local files_nl
    files_nl="$(           echo "$parsed" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('files_str',''))")"
    if [[ -n "$files_nl" ]]; then
      while IFS= read -r f; do
        [[ -n "$f" ]] && FILES_FROM_PAYLOAD+=("$f")
      done <<< "$files_nl"
    fi
  fi
}

read_payload

# Forward parsed turn to evidence validator
if [[ -n "$TURN_FROM_PAYLOAD" ]]; then
  export FORGEWRIGHT_TURN="$TURN_FROM_PAYLOAD"
fi

# ── collect changed files from git (staged, unstaged, untracked) ──────────────
_collect_git_files() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    return 0
  fi
  # Use printf to handle filenames with spaces and special chars
  while IFS= read -r -d $'\0' file; do
    [[ -n "$file" ]] && echo "$file"
  done < <(
    git diff --name-only -z
    git diff --name-only -z --cached
    git status --porcelain -z | while IFS= read -r -d $'\0' entry; do
      status="${entry:0:2}"
      file="${entry:3}"
      [[ "$status" == '??' ]] && printf '%s\0' "$file"
    done
  )
}

# Merge: payload files + git files (deduplicated).
# Keep this Bash 3.2 compatible for macOS system bash: no associative arrays.
FILES_TO_CHECK=()

add_file() {
  local f="$1"
  [[ -z "$f" ]] && return
  local existing
  if [[ ${#FILES_TO_CHECK[@]} -gt 0 ]]; then
    for existing in "${FILES_TO_CHECK[@]}"; do
      [[ "$existing" == "$f" ]] && return
    done
  fi
  FILES_TO_CHECK+=("$f")
}

if [[ ${#FILES_FROM_PAYLOAD[@]} -gt 0 ]]; then
  for f in "${FILES_FROM_PAYLOAD[@]}"; do add_file "$f"; done
fi
while IFS= read -r f; do add_file "$f"; done < <(_collect_git_files)

# ── classify: does the changeset contain code edits? ──────────────────────────
_SKIP_PATTERNS=(
  "*.md" "*.txt"
  ".gitignore" ".gitattributes" ".memignore" ".cursorignore"
  ".forgewright/*" "memory.db*" ".gitnexus/*" ".forgenexus/*"
  "scripts/lite/*"
)

_is_skip() {
  local f="${1#./}"  # strip leading ./
  for pat in "${_SKIP_PATTERNS[@]}"; do
    # shellcheck disable=SC2254
    case "$f" in $pat) return 0;; esac
    if [[ "$pat" == *"/*" ]]; then
      local dir="${pat%/*}"
      [[ "$f" == "$dir"/* || "$f" == "$dir" ]] && return 0
    fi
  done
  return 1
}

has_code_edits() {
  if [[ ${#FILES_TO_CHECK[@]} -gt 0 ]]; then
    for f in "${FILES_TO_CHECK[@]}"; do
      _is_skip "$f" || return 0
    done
  fi
  return 1
}

if ! has_code_edits; then
  log_info "No code changes detected — gate OPEN (no VERIFY block required)"
  exit 0
fi

log_info "Code changes detected. Running verification gate checks..."

# ── export context for Python validator ───────────────────────────────────────
export RESPONSE_CONTENT
# Newline-separated filenames. This preserves spaces; filenames containing
# literal newlines are intentionally unsupported by this hook interface.
FILES_TO_CHECK_STR="$(printf '%s\n' "${FILES_TO_CHECK[@]}")"
export FILES_TO_CHECK_STR
unset FILES_TO_CHECK_NUL

python3 "${SCRIPT_DIR}/verify_gate.py"
GATE_RC=$?

if [[ $GATE_RC -ne 0 ]]; then
  log_error "Evidence validation FAILED — gate BLOCKED"
  exit 1
fi

# ── check response content for a valid VERIFY block ──────────────────────────
log_info "Checking response content for a valid VERIFY block..."

_has_verify_block() {
  local content="$1"
  [[ -z "$content" ]] && return 1
  echo "$content" | grep -qEi '```(verify|verification)' && return 0
  echo "$content" | grep -qEi '(^|[[:space:]])VERIFY([[:space:]:]|$|###|#)' && return 0
  echo "$content" | grep -qEi '(^|[[:space:]])VERIFICATION([[:space:]:]|$|###|#)' && return 0
  echo "$content" | grep -qEi '###.*(verify|verification)' && return 0
  return 1
}

if [[ -z "$RESPONSE_CONTENT" ]]; then
  log_warn "No response content provided (stdin was empty / no payload)."
  log_error "VERIFY block REQUIRED when code changes exist."
  exit 1
fi

if _has_verify_block "$RESPONSE_CONTENT"; then
  log_info "Valid VERIFY block found — gate OPEN"
  exit 0
else
  log_error "Missing VERIFY block in response."
  log_error "Include a VERIFY section (e.g. \`VERIFY:\` or \`\`\`verify\`\`\` block) when modifying code."
  exit 1
fi
