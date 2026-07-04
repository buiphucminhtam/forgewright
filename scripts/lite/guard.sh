#!/usr/bin/env bash
# scripts/lite/guard.sh
# Forgewright Stage E0 pre-edit guard.
# Works on macOS and Linux/Git-Bash.
#
# Usage:
#   bash scripts/lite/guard.sh [file1] [file2] ...
#   (with no args: checks all git-tracked changes)
#
# Tri-state protected path actions:
#   CREATE  → ALLOWED   (new credential file? fine — it's empty)
#   MODIFY  → BLOCKED   (editing a secret file → hard block)
#   DELETE  → BLOCKED   (deleting a secret file → hard block)
#
# Forced-HARD signals:
#   Exits with code 2 when a HARD-classification pattern is detected
#   (auth/security/schema-changing content) so upstream orchestrators
#   know to escalate rather than auto-proceed.
#
# Exit codes:
#   0 — guard PASSED
#   1 — guard FAILED (destructive/protected violation)
#   2 — HARD-classified content detected (escalate required)

set -uo pipefail

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[GUARD]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[GUARD] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[GUARD] ERROR:${NC} $*" >&2; }
log_hard()  { echo -e "${CYAN}[GUARD] HARD-SIGNAL:${NC} $*" >&2; }

# ── resolve project root dynamically ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

# ── GitNexus: resolve binary path ────────────────────────────────────────────
GITNEXUS_BIN=""
if command -v gitnexus &>/dev/null; then
  GITNEXUS_BIN="gitnexus"
elif [[ -x "/opt/homebrew/bin/gitnexus" ]]; then
  GITNEXUS_BIN="/opt/homebrew/bin/gitnexus"
elif [[ -x "${HOME}/.local/bin/gitnexus" ]]; then
  GITNEXUS_BIN="${HOME}/.local/bin/gitnexus"
fi

# ── protected path patterns (glob-style, relative to project root) ─────────────
# Format: "pattern:REASON"
PROTECTED_PATTERNS=(
  ".env:credential-file"
  ".env.*:credential-file"
  "*.pem:key-file"
  "*.key:key-file"
  "*.cert:cert-file"
  "*.crt:cert-file"
  "*.pub:public-key"
  "credentials/*:credentials-directory"
  "secrets/*:secrets-directory"
  ".git/*:git-internals"
  ".gitnexus/*:index-file"
  ".forgenexus/*:index-file"
  ".forgewright/memory.db*:memory-db"
  "memory.db*:memory-db"
)

# ── files guarded by MODIFY only (skip CREATE) ─────────────────────────────
# Returns reason string if protected, empty string if not
_protected_reason() {
  local file_path="${1#./}"  # strip leading ./
  for entry in "${PROTECTED_PATTERNS[@]}"; do
    local pattern="${entry%%:*}"
    local reason="${entry##*:}"
    # Glob match
    # shellcheck disable=SC2254
    case "$file_path" in
      $pattern)
        echo "$reason"
        return
        ;;
    esac
    # Directory prefix match (e.g. credentials/*)
    if [[ "$pattern" == *"/*" ]]; then
      local dir_prefix="${pattern%/*}"
      if [[ "$file_path" == "$dir_prefix"/* || "$file_path" == "$dir_prefix" ]]; then
        echo "$reason"
        return
      fi
    fi
  done
  echo ""
}

# ── tri-state action (CREATE / MODIFY / DELETE) ───────────────────────────────
_file_action() {
  local file="${1#./}"
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    if ! git rev-parse HEAD &>/dev/null 2>&1; then
      echo "CREATE"; return
    fi
    local in_head=0 on_disk=0
    git cat-file -e "HEAD:${file}" &>/dev/null 2>&1 && in_head=1
    [[ -f "$file" ]] && on_disk=1
    if [[ $in_head -eq 1 ]]; then
      [[ $on_disk -eq 1 ]] && echo "MODIFY" || echo "DELETE"
    else
      # May be tracked in index (staged new file)
      if git ls-files --error-unmatch "$file" &>/dev/null 2>&1; then
        [[ $on_disk -eq 1 ]] && echo "MODIFY" || echo "DELETE"
      else
        echo "CREATE"
      fi
    fi
  else
    [[ -f "$file" ]] && echo "MODIFY" || echo "CREATE"
  fi
}

# ── HARD-signal patterns (content that requires escalation) ──────────────────
# Returns a description if HARD-classified content is found, empty otherwise
_hard_classified_content() {
  local file="$1"
  [[ ! -f "$file" ]] && echo "" && return

  # Self-guard exception: lite scripts intentionally contain guard keywords
  # such as jwt, secret, private_key, DROP TABLE, and rm -rf as patterns/tests.
  # Scanning them as ordinary product code produces false HARD signals.
  case "$file" in
    scripts/lite/*|./scripts/lite/*|"${PROJECT_ROOT}"/scripts/lite/*)
      echo ""
      return
      ;;
  esac

  # Auth / secret surface
  if grep -qEi \
    "(jwt|bearer|oauth|api[_-]?key|secret[_-]?key|password|passwd|private[_-]?key)" \
    "$file" 2>/dev/null; then
    echo "auth/secret surface"
    return
  fi
  # Schema / cross-module contract changes
  if grep -qEi \
    "(ALTER TABLE|CREATE TABLE|DROP TABLE|MIGRATION|@Entity|@Column|interface [A-Z]|type [A-Z][a-zA-Z]+ =)" \
    "$file" 2>/dev/null; then
    echo "schema/contract change"
    return
  fi
  # Concurrency / async ordering
  if grep -qEi \
    "(asyncio\.Lock|threading\.Lock|Promise\.all|Promise\.race|async def|await Promise)" \
    "$file" 2>/dev/null; then
    echo "concurrency/async"
    return
  fi
  echo ""
}

# ── destructive command patterns (deny table) ──────────────────────────────────
_check_deny_content() {
  local file="$1"
  [[ ! -f "$file" ]] && return 0

  # Self-guard exception: don't lock out lite scripts
  [[ "$file" == scripts/lite/* ]] && return 0

  local deny_found=""

  # rm -rf (but allow rm -rf in comments: # rm -rf)
  if grep -q "^[^#]*rm[[:space:]].*-rf\|^[^#]*rm[[:space:]].*-r[[:space:]]" "$file" 2>/dev/null; then
    deny_found="'rm -rf' pattern"
  fi

  # force push
  if grep -qEi "^[^#]*git\s+push\s+(--force|-f\b)|^[^#]*force\s+push" "$file" 2>/dev/null; then
    deny_found="force push pattern"
  fi

  # DROP TABLE / DATABASE (not in comments)
  if grep -qEi "^[^#;/\*]*DROP\s+(TABLE|DATABASE)" "$file" 2>/dev/null; then
    deny_found="DROP TABLE/DATABASE"
  fi

  # curl|sh or wget|sh (remote execution)
  if grep -qEi "^[^#]*curl\s+.*\|\s*(bash|sh\b)|^[^#]*wget\s+.*\|\s*(bash|sh\b)" "$file" 2>/dev/null; then
    deny_found="remote execution (curl|sh)"
  fi

  # chmod 777 (overly permissive)
  if grep -qE "^[^#]*chmod\s+777\b" "$file" 2>/dev/null; then
    deny_found="chmod 777 (overly permissive)"
  fi

  if [[ -n "$deny_found" ]]; then
    log_error "Deny table violation in ${file}: ${deny_found}"
    return 1
  fi
  return 0
}

# ── check command-line arguments for dangerous patterns ───────────────────────
HARD_EXIT=0
for arg in "$@"; do
  case "$arg" in
    *"rm -rf"* | *"rm -r "*)
      log_error "Deny table violation in args: 'rm -rf' in: $arg"; exit 1 ;;
    *"force push"* | *"git push --force"* | *"git push -f "*)
      log_error "Deny table violation in args: force push in: $arg"; exit 1 ;;
    *"DROP TABLE"* | *"DROP DATABASE"* | *"drop table"* | *"drop database"*)
      log_error "Deny table violation in args: DROP in: $arg"; exit 1 ;;
    *"curl "*"|"*"sh"* | *"curl "*"|"*"bash"*)
      log_error "Deny table violation in args: remote execution in: $arg"; exit 1 ;;
  esac
done

# ── collect files to check ────────────────────────────────────────────────────
FILES_TO_CHECK=()
if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    FILES_TO_CHECK+=("$arg")
  done
else
  # Auto-detect from git (NUL-safe for filenames with spaces)
  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    while IFS= read -r -d $'\0' file; do
      [[ -n "$file" ]] && FILES_TO_CHECK+=("$file")
    done < <(
      git diff --name-only -z
      git diff --name-only -z --cached
      git status --porcelain -z | while IFS= read -r -d $'\0' entry; do
        status="${entry:0:2}"
        file="${entry:3}"
        [[ "$status" == '??' ]] && printf '%s\0' "$file"
      done
    )
  fi
fi

# ── main checks ───────────────────────────────────────────────────────────────
BLOCKED_FILES=()
HARD_FILES=()

for file in "${FILES_TO_CHECK[@]}"; do
  file="${file#./}"  # normalise

  action="$(_file_action "$file")"

  # 1. Tri-state protected path check
  reason="$(_protected_reason "$file")"
  if [[ -n "$reason" ]]; then
    if [[ "$action" == "CREATE" ]]; then
      log_info "ALLOWED CREATE of protected path (${reason}): ${file}"
    else
      log_error "BLOCKED ${action} of protected path (${reason}): ${file}"
      BLOCKED_FILES+=("$file")
      continue  # Skip further checks on blocked file
    fi
  fi

  # 2. Content deny table check
  if ! _check_deny_content "$file"; then
    exit 1  # Already logged — hard exit
  fi

  # 3. HARD-signal classification
  hard_reason="$(_hard_classified_content "$file")"
  if [[ -n "$hard_reason" ]]; then
    log_hard "File '${file}' contains ${hard_reason} — step must be escalated (HARD)"
    HARD_FILES+=("$file")
  fi
done

if [[ ${#BLOCKED_FILES[@]} -gt 0 ]]; then
  log_error "Guard FAILED: protected path violations:"
  for f in "${BLOCKED_FILES[@]}"; do echo "   - $f" >&2; done
  exit 1
fi

log_info "No protected-path violations and no deny patterns found."

# ── GitNexus code intelligence (advisory) ────────────────────────────────────
if [[ -d ".gitnexus" && -n "$GITNEXUS_BIN" ]]; then
  log_info "Running GitNexus checks (${GITNEXUS_BIN})..."

  # Determine repo name from root directory (dynamic — no hardcoding)
  REPO_NAME="$(basename "${PROJECT_ROOT}")"

  if "${GITNEXUS_BIN}" check --cycles -r "${REPO_NAME}" &>/dev/null 2>&1; then
    log_info "GitNexus: No circular imports detected."
  else
    log_error "GitNexus: Circular imports detected — guard BLOCKED."
    "${GITNEXUS_BIN}" check --cycles -r "${REPO_NAME}" || true
    exit 1
  fi

  if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    changes="$("${GITNEXUS_BIN}" detect-changes -r "${REPO_NAME}" 2>&1 || true)"
    if [[ -n "$changes" && "$changes" != *"No changes detected"* ]]; then
      echo -e "${BLUE}[GUARD] GitNexus Change Impact:${NC}"
      echo "$changes" | sed 's/^/  /'
    fi
  fi
elif [[ -d ".gitnexus" && -z "$GITNEXUS_BIN" ]]; then
  log_warn "GitNexus index present but 'gitnexus' binary not found — skipping analysis."
else
  log_warn "GitNexus index (.gitnexus/) not found — consider running 'gitnexus analyze'."
fi

# ── HARD-signal exit ─────────────────────────────────────────────────────────
if [[ ${#HARD_FILES[@]} -gt 0 ]]; then
  log_hard "Guard PASSED but HARD-classification required for: ${HARD_FILES[*]}"
  log_hard "Upstream orchestrator must escalate this step (exit code 2)."
  exit 2
fi

log_info "Guard verification PASSED."
exit 0
