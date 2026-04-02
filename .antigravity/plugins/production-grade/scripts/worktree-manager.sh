#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Worktree Manager — Git worktree lifecycle for parallel dispatch
# Part of Forgewright Production Grade Plugin
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

WORKTREE_BASE=".worktrees"
MAX_WORKERS="${MAX_WORKERS:-4}"
LOG_FILE=".forgewright/worktree-log.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[worktree]${NC} $*"; }
ok()  { echo -e "${GREEN}✓${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }

# ━━━ Commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cmd_create() {
  local task_id="$1"
  local branch_name="${2:-parallel/${task_id}}"
  local worktree_path="${WORKTREE_BASE}/${task_id}"

  # Validate we're in a git repo
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    err "Not inside a git repository"
    exit 1
  fi

  # Check max workers
  local active_count
  active_count=$(git worktree list --porcelain 2>/dev/null | grep -c "^worktree " || echo "0")
  active_count=$((active_count - 1))  # Subtract main worktree
  if [ "$active_count" -ge "$MAX_WORKERS" ]; then
    err "Max workers reached ($MAX_WORKERS). Clean up before creating more."
    exit 1
  fi

  # Create worktree directory
  mkdir -p "${WORKTREE_BASE}"

  # Check if worktree already exists
  if [ -d "$worktree_path" ]; then
    warn "Worktree already exists at $worktree_path"
    echo "Use 'cleanup $task_id' first, or 'resume $task_id' to continue."
    exit 1
  fi

  # Create branch if it doesn't exist
  if git show-ref --verify --quiet "refs/heads/${branch_name}" 2>/dev/null; then
    log "Branch ${branch_name} already exists, reusing..."
    git worktree add "$worktree_path" "$branch_name"
  else
    log "Creating branch ${branch_name} from HEAD..."
    git worktree add -b "$branch_name" "$worktree_path"
  fi

  # Copy shared context into worktree
  if [ -d "skills/_shared/protocols" ]; then
    mkdir -p "${worktree_path}/skills/_shared/protocols"
    cp -r skills/_shared/protocols/* \
      "${worktree_path}/skills/_shared/protocols/" 2>/dev/null || true
  fi

  # Copy .production-grade.yaml if exists
  if [ -f ".production-grade.yaml" ]; then
    cp ".production-grade.yaml" "${worktree_path}/.production-grade.yaml"
  fi

  ok "Worktree created: $worktree_path (branch: $branch_name)"
  log "Worker can now operate in: $(cd "$worktree_path" && pwd)"

  # Log
  _log_event "CREATE" "$task_id" "$branch_name" "$worktree_path"
}

cmd_status() {
  echo ""
  echo "━━━ Active Worktrees ━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  if ! [ -d "$WORKTREE_BASE" ]; then
    log "No worktrees found."
    return
  fi

  local count=0
  for wt_dir in "${WORKTREE_BASE}"/*/; do
    [ -d "$wt_dir" ] || continue
    local task_id
    task_id=$(basename "$wt_dir")
    local branch
    branch=$(cd "$wt_dir" && git branch --show-current 2>/dev/null || echo "unknown")
    local has_contract="✗"
    local has_delivery="✗"
    local has_validation="✗"

    [ -f "${wt_dir}/CONTRACT.json" ] && has_contract="✓"
    [ -f "${wt_dir}/DELIVERY.json" ] && has_delivery="✓"
    [ -f "${wt_dir}/VALIDATION.json" ] && has_validation="✓"

    printf "  %-12s branch: %-30s Contract:%s Delivery:%s Validated:%s\n" \
      "$task_id" "$branch" "$has_contract" "$has_delivery" "$has_validation"
    count=$((count + 1))
  done

  echo ""
  echo "  Total: ${count}/${MAX_WORKERS} workers"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

cmd_validate() {
  local task_id="$1"
  local worktree_path="${WORKTREE_BASE}/${task_id}"

  if ! [ -d "$worktree_path" ]; then
    err "Worktree not found: $worktree_path"
    exit 1
  fi

  log "Validating task $task_id..."

  local errors=0

  # Check CONTRACT.json exists
  if ! [ -f "${worktree_path}/CONTRACT.json" ]; then
    err "Missing CONTRACT.json"
    errors=$((errors + 1))
  fi

  # Check DELIVERY.json exists
  if ! [ -f "${worktree_path}/DELIVERY.json" ]; then
    err "Missing DELIVERY.json"
    errors=$((errors + 1))
  fi

  # Check boundary violations
  if [ -f "${worktree_path}/CONTRACT.json" ]; then
    local branch
    branch=$(cd "$worktree_path" && git branch --show-current)

    # Get changed files
    local changed_files
    changed_files=$(cd "$worktree_path" && git diff --name-only main..."$branch" 2>/dev/null || echo "")

    if [ -n "$changed_files" ]; then
      log "Changed files:"
      echo "$changed_files" | while read -r f; do
        echo "  $f"
      done
    else
      warn "No files changed in worktree"
    fi
  fi

  # Check for forbidden patterns in source files
  local forbidden_count=0
  for pattern in "TODO" "FIXME" "// implement" "throw new Error('Not implemented')"; do
    local matches
    matches=$(cd "$worktree_path" && grep -rn "$pattern" \
      --include="*.ts" --include="*.py" --include="*.go" \
      --include="*.java" --include="*.rs" --include="*.js" \
      --exclude-dir="node_modules" --exclude-dir=".git" \
      --exclude-dir="tests" --exclude-dir="__tests__" \
      2>/dev/null | head -5 || echo "")
    if [ -n "$matches" ]; then
      warn "Forbidden pattern '$pattern' found:"
      echo "$matches" | head -3
      forbidden_count=$((forbidden_count + 1))
    fi
  done

  if [ $errors -eq 0 ] && [ $forbidden_count -eq 0 ]; then
    ok "Validation PASSED for $task_id"
    _log_event "VALIDATE" "$task_id" "PASS" ""
    return 0
  elif [ $errors -gt 0 ]; then
    err "Validation FAILED for $task_id ($errors critical errors)"
    _log_event "VALIDATE" "$task_id" "FAIL" "$errors errors"
    return 1
  else
    warn "Validation WARN for $task_id ($forbidden_count pattern warnings)"
    _log_event "VALIDATE" "$task_id" "WARN" "$forbidden_count warnings"
    return 0
  fi
}

cmd_merge() {
  local task_id="$1"
  local worktree_path="${WORKTREE_BASE}/${task_id}"

  if ! [ -d "$worktree_path" ]; then
    err "Worktree not found: $worktree_path"
    exit 1
  fi

  local branch
  branch=$(cd "$worktree_path" && git branch --show-current)

  log "Merging $branch into main..."

  # Switch to main
  git checkout main

  # Attempt merge
  if git merge --no-ff "$branch" -m "merge: ${task_id} (parallel dispatch)"; then
    ok "Merged $branch successfully"
    _log_event "MERGE" "$task_id" "SUCCESS" "$branch"
  else
    err "Merge conflicts detected. Aborting."
    git merge --abort
    _log_event "MERGE" "$task_id" "CONFLICT" "$branch"
    return 1
  fi
}

cmd_cleanup() {
  local task_id="$1"
  local worktree_path="${WORKTREE_BASE}/${task_id}"

  if [ -d "$worktree_path" ]; then
    local branch
    branch=$(cd "$worktree_path" && git branch --show-current 2>/dev/null || echo "")

    # Remove worktree
    git worktree remove "$worktree_path" --force 2>/dev/null || rm -rf "$worktree_path"

    # Delete branch
    if [ -n "$branch" ] && [ "$branch" != "main" ]; then
      git branch -D "$branch" 2>/dev/null || true
    fi

    ok "Cleaned up $task_id"
    _log_event "CLEANUP" "$task_id" "DONE" ""
  else
    warn "Worktree not found: $worktree_path (already cleaned?)"
  fi
}

cmd_cleanup_all() {
  log "Cleaning up all worktrees..."

  if ! [ -d "$WORKTREE_BASE" ]; then
    log "No worktrees to clean."
    return
  fi

  for wt_dir in "${WORKTREE_BASE}"/*/; do
    [ -d "$wt_dir" ] || continue
    local task_id
    task_id=$(basename "$wt_dir")
    cmd_cleanup "$task_id"
  done

  rmdir "$WORKTREE_BASE" 2>/dev/null || true
  ok "All worktrees cleaned"
}

cmd_resume() {
  local task_id="$1"
  local worktree_path="${WORKTREE_BASE}/${task_id}"

  if ! [ -d "$worktree_path" ]; then
    err "No worktree to resume: $worktree_path"
    exit 1
  fi

  # Check if there's a DELIVERY.json with failure
  if [ -f "${worktree_path}/DELIVERY.json" ]; then
    log "Previous delivery found. Worker can retry from checkpoint."
  fi

  # Check if there's a VALIDATION.json with failures
  if [ -f "${worktree_path}/VALIDATION.json" ]; then
    log "Previous validation found. Worker should fix issues and re-deliver."
  fi

  ok "Worktree ready for resume: $worktree_path"
  _log_event "RESUME" "$task_id" "READY" ""
}

# ━━━ Internal helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_log_event() {
  local action="$1" task_id="$2" status="$3" details="$4"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  mkdir -p "$(dirname "$LOG_FILE")"

  if ! [ -f "$LOG_FILE" ]; then
    cat > "$LOG_FILE" <<'EOF'
# Worktree Event Log

| Timestamp | Action | Task | Status | Details |
|-----------|--------|------|--------|---------|
EOF
  fi

  echo "| $timestamp | $action | $task_id | $status | $details |" >> "$LOG_FILE"
}

# ━━━ Usage ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

usage() {
  cat <<EOF

  Usage: worktree-manager.sh <command> [args]

  Commands:
    create <task_id> [branch_name]   Create worktree + branch for a task
    status                           List active worktrees and their state
    validate <task_id>               Validate a worker's output vs contract
    merge <task_id>                  Merge validated branch into main
    cleanup <task_id>                Remove worktree + branch
    cleanup-all                      Remove all worktrees
    resume <task_id>                 Resume work on a failed task

  Environment:
    MAX_WORKERS    Maximum concurrent worktrees (default: 4)

  Examples:
    ./scripts/worktree-manager.sh create T3a parallel/T3a-backend
    ./scripts/worktree-manager.sh status
    ./scripts/worktree-manager.sh validate T3a
    ./scripts/worktree-manager.sh merge T3a
    ./scripts/worktree-manager.sh cleanup-all

EOF
}

# ━━━ Main dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
  local cmd="${1:-}"

  case "$cmd" in
    create)      shift; cmd_create "$@" ;;
    status)      cmd_status ;;
    validate)    shift; cmd_validate "$@" ;;
    merge)       shift; cmd_merge "$@" ;;
    cleanup)     shift; cmd_cleanup "$@" ;;
    cleanup-all) cmd_cleanup_all ;;
    resume)      shift; cmd_resume "$@" ;;
    help|--help|-h|"") usage ;;
    *)           err "Unknown command: $cmd"; usage; exit 1 ;;
  esac
}

main "$@"
