#!/usr/bin/env bash
# scripts/lite/guard.sh
# Upgraded Stage E0 (Part B) pre-edit guard script.
# Works on macOS and Windows/Git-Bash.

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[GUARD]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[GUARD] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[GUARD] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

# Determine gitnexus path
GITNEXUS_BIN="gitnexus"
if ! command -v gitnexus &>/dev/null; then
  if [[ -x "/opt/homebrew/bin/gitnexus" ]]; then
    GITNEXUS_BIN="/opt/homebrew/bin/gitnexus"
  elif [[ -x "$HOME/.local/bin/gitnexus" ]]; then
    GITNEXUS_BIN="$HOME/.local/bin/gitnexus"
  fi
fi

# Protected path patterns (glob patterns)
PROTECTED_PATTERNS=(
  ".env"
  ".env.*"
  "*.pem"
  "*.key"
  "*.cert"
  "*.crt"
  "*.pub"
  "credentials/*"
  "secrets/*"
  ".git/*"
  ".gitnexus/*"
  ".forgenexus/*"
  ".forgewright/memory.db*"
  "memory.db*"
)

# Function to check if a file path matches protected patterns
is_protected() {
  local file_path="$1"
  # Normalize path: remove leading "./"
  file_path="${file_path#./}"

  # Direct matching and pattern matching
  for pattern in "${PROTECTED_PATTERNS[@]}"; do
    if [[ "$file_path" == $pattern ]]; then
      return 0
    fi
    # Check if inside a protected directory (e.g. credentials/*)
    if [[ "$pattern" == *"/*" ]]; then
      local dir_prefix="${pattern%/*}"
      if [[ "$file_path" == "$dir_prefix"/* || "$file_path" == "$dir_prefix" ]]; then
        return 0
      fi
    fi
  done
  return 1
}

# Determine action: CREATE, MODIFY, or DELETE
get_file_action() {
  local file="$1"
  file="${file#./}"

  if git rev-parse --is-inside-work-tree &>/dev/null; then
    # If no HEAD, everything is CREATE
    if ! git rev-parse HEAD &>/dev/null; then
      echo "CREATE"
      return
    fi

    # Check if file exists in HEAD or is tracked in git index
    if git cat-file -e "HEAD:$file" &>/dev/null || git ls-files --error-unmatch "$file" &>/dev/null; then
      # File exists in HEAD/git. Check if it exists on disk.
      if [[ -f "$file" ]]; then
        echo "MODIFY"
      else
        echo "DELETE"
      fi
    else
      echo "CREATE"
    fi
  else
    # Non-git fallback
    if [[ -f "$file" ]]; then
      echo "MODIFY"
    else
      echo "CREATE"
    fi
  fi
}

# Pre-tool deny table check function
check_deny_patterns_in_content() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 0
  fi

  # Skip checking the guard scripts themselves to prevent self-lock
  if [[ "$file" == scripts/lite/* ]]; then
    return 0
  fi

  # Scan for rm -rf
  if grep -q -F "rm -rf" "$file"; then
    log_error "Deny table violation in $file: 'rm -rf' pattern detected."
    return 1
  fi

  # Scan for force push patterns
  if grep -E -q -i "git.*push.*(--force|-f\b)|force\s+push" "$file"; then
    log_error "Deny table violation in $file: force push pattern detected."
    return 1
  fi

  # Scan for DROP TABLE / DATABASE
  if grep -E -q -i "DROP\s+(TABLE|DATABASE)" "$file"; then
    log_error "Deny table violation in $file: 'DROP TABLE' or 'DROP DATABASE' detected."
    return 1
  fi

  # Scan for curl|sh or wget|sh patterns
  if grep -E -q -i "curl\s+.*\|\s*(bash|sh\b)|wget\s+.*\|\s*(bash|sh\b)" "$file"; then
    log_error "Deny table violation in $file: remote execution pattern (curl|sh) detected."
    return 1
  fi

  return 0
}

# Determine list of files to check
FILES_TO_CHECK=()
if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    FILES_TO_CHECK+=("$arg")
  done
else
  # If no args, check git diff / status for modified files
  if git rev-parse --is-inside-work-tree &>/dev/null; then
    while IFS= read -r file; do
      if [[ -n "$file" ]]; then
        FILES_TO_CHECK+=("$file")
      fi
    done < <(git diff --name-only; git diff --name-only --cached; git status --porcelain | grep -E '^\?\?' | cut -c4-)
  fi
fi

# 1. Pre-tool Deny Table Command-line Argument Check
# Verify if any input command argument contains dangerous patterns
for arg in "$@"; do
  if [[ "$arg" =~ rm\ -rf ]] || \
     [[ "$arg" =~ force\ push ]] || \
     [[ "$arg" =~ git\ push.*--force ]] || \
     [[ "$arg" =~ git\ push.*-f ]] || \
     [[ "$arg" =~ (DROP|drop)\ (TABLE|table|DATABASE|database) ]] || \
     [[ "$arg" =~ curl.*\|\ *(sh|bash) ]] || \
     [[ "$arg" =~ wget.*\|\ *(sh|bash) ]]; then
    log_error "Deny table violation in command arguments: '$arg'"
    exit 1
  fi
done

# 2. Tri-state Protected Paths Check and Content Deny Check
BLOCKED_FILES=()
for file in "${FILES_TO_CHECK[@]}"; do
  # Determine operation state
  action=$(get_file_action "$file")
  
  if is_protected "$file"; then
    if [[ "$action" == "CREATE" ]]; then
      log_info "Allowed CREATE of protected path: $file"
    else
      log_error "Blocked $action to protected path: $file"
      BLOCKED_FILES+=("$file")
    fi
  fi

  # Also scan the file content for pre-tool deny patterns
  if [[ -f "$file" ]]; then
    if ! check_deny_patterns_in_content "$file"; then
      exit 1
    fi
  fi
done

if [[ ${#BLOCKED_FILES[@]} -gt 0 ]]; then
  log_error "Edit guard verification FAILED due to protected path violations."
  exit 1
fi

log_info "No protected paths violated and no deny patterns found."

# 3. GitNexus Code Intelligence Checks
if [[ -d ".gitnexus" ]]; then
  log_info "GitNexus index detected (.gitnexus/)"
  if command -v "$GITNEXUS_BIN" &>/dev/null; then
    log_info "Running GitNexus checks with $GITNEXUS_BIN..."
    
    # Run cycle check - treat failure as blocking
    if "$GITNEXUS_BIN" check --cycles -r forgewright &>/dev/null; then
      log_info "GitNexus: No circular imports or architectural violations found."
    else
      log_error "GitNexus: Circular imports or check issues detected! Blocked."
      # Let the user run the check command directly for output
      "$GITNEXUS_BIN" check --cycles -r forgewright || true
      exit 1
    fi
    
    # Run impact/changes check if we have modified files
    if git rev-parse --is-inside-work-tree &>/dev/null; then
      changes=$("$GITNEXUS_BIN" detect-changes -r forgewright 2>&1 || true)
      if [[ -n "$changes" && "$changes" != *"No changes detected"* ]]; then
        echo -e "${BLUE}[GUARD] GitNexus Change Impact Analysis:${NC}"
        echo "$changes" | sed 's/^/  /'
      fi
    fi
  else
    log_warn "GitNexus index present, but 'gitnexus' CLI binary not found. Skipping execution analysis."
  fi
else
  log_warn "GitNexus index (.gitnexus/) not found. Consider running 'gitnexus analyze' for code intelligence."
fi

log_info "Edit guard verification PASSED."
exit 0
