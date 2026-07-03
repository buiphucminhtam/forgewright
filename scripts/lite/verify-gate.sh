#!/usr/bin/env bash
# scripts/lite/verify-gate.sh
# Upgraded turn-completion verify-gate checker.
# Works on macOS and Windows/Git-Bash.

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[VERIFY-GATE]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[VERIFY-GATE] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[VERIFY-GATE] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Get changed files (unstaged, staged, untracked)
FILES_TO_CHECK=()
if git rev-parse --is-inside-work-tree &>/dev/null; then
  while IFS= read -r file; do
    if [[ -n "$file" ]]; then
      FILES_TO_CHECK+=("$file")
    fi
  done < <(git diff --name-only; git diff --name-only --cached; git status --porcelain | grep -E '^\?\?' | cut -c4-)
fi

# Check if code edits exist in git
has_code_edits() {
  if [[ ${#FILES_TO_CHECK[@]} -eq 0 ]]; then
    return 1
  fi

  for file in "${FILES_TO_CHECK[@]}"; do
    # Skip documentation files
    if [[ "$file" == *.md || "$file" == *.txt ]]; then
      continue
    fi
    # Skip git/ide config files
    if [[ "$file" == .gitignore || "$file" == .gitattributes || "$file" == .memignore || "$file" == .cursorignore ]]; then
      continue
    fi
    # Skip session/tracking files and memory DB
    if [[ "$file" == .forgewright/* || "$file" == memory.db* || "$file" == .gitnexus/* || "$file" == .forgenexus/* ]]; then
      continue
    fi
    # Skip the verification gate scripts themselves to prevent self-lock
    if [[ "$file" == scripts/lite/* ]]; then
      continue
    fi
    # If any other file type is changed, it is a code edit
    return 0
  done
  return 1
}

# Read response content
RESPONSE_CONTENT=""
if [[ ! -t 0 ]]; then
  # Read from stdin with a timeout to prevent hanging
  if read -t 1 first_line; then
    RESPONSE_CONTENT="${first_line}"$'\n'$(cat)
  fi
elif [[ $# -gt 0 && -f "$1" ]]; then
  # Read from file argument
  RESPONSE_CONTENT=$(cat "$1")
fi

# Determine if we have code changes
if ! has_code_edits; then
  log_info "No code changes detected. Verification gate passed (no VERIFY block required)."
  exit 0
fi

log_info "Code changes detected. Executing verification gate checks..."

# Export response content and files to check to python environment
export RESPONSE_CONTENT
export FILES_TO_CHECK_STR="${FILES_TO_CHECK[*]:-}"

# Run Python-based helper
python3 "$SCRIPT_DIR/verify_gate.py"

# 5. Check response content for a valid VERIFY block
log_info "Checking response content for a valid VERIFY block..."
has_verify_block() {
  local content="$1"
  if [[ -z "$content" ]]; then
    return 1
  fi

  if echo "$content" | grep -qEi '```(verify|verification)' || \
     echo "$content" | grep -qEi '(^|[[:space:]])VERIFY([[:space:]:]|$|###|#)' || \
     echo "$content" | grep -qEi '(^|[[:space:]])VERIFICATION([[:space:]:]|$|###|#)' || \
     echo "$content" | grep -qEi '###.*(verify|verification)'; then
    return 0
  fi
  return 1
}

if [[ -z "$RESPONSE_CONTENT" ]]; then
  log_warn "No response content was provided to verify-gate (stdin was empty and no file arg given)."
  log_warn "Assuming VERIFY block is missing in the output."
  log_error "VERIFY block is REQUIRED when code changes exist."
  exit 1
fi

if has_verify_block "$RESPONSE_CONTENT"; then
  log_info "Valid VERIFY block found. Gate passed!"
  exit 0
else
  log_error "Missing a valid VERIFY block in your response."
  log_error "When modifying code, you must include a VERIFY section (e.g. \`VERIFY:\` or a \`\`\`verify\`\`\` block) explaining how the change was tested."
  exit 1
fi
