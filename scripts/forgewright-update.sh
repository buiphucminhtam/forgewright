#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ForgeWright Updater — Update existing ForgeWright installation
#
# WHAT THIS DOES:
#   1. Pull latest changes from GitHub
#   2. Update submodules
#   3. Rebuild ForgeNexus if needed
#   4. Migrate database if needed (SQLite → KuzuDB)
#   5. Re-index codebases
#
# USAGE:
#   bash forgewright-update.sh              # Update ForgeWright
#   bash forgewright-update.sh --migrate    # Force database migration
#   bash forgewright-update.sh --reindex    # Full re-index after update
#   bash forgewright-update.sh --check      # Check for updates
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}➜${NC} $1"; }
success()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

# ═══════════════════════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(dirname "$SCRIPT_DIR")"

# ═══════════════════════════════════════════════════════════════════════════════
# GIT OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

git_pull() {
    info "Pulling latest changes..."

    if [[ ! -d ".git" ]]; then
        error "Not a git repository: ${FORGEWRIGHT_DIR}"
        return 1
    fi

    cd "$FORGEWRIGHT_DIR"

    local current_branch
    current_branch=$(git branch --show-current)
    [[ -z "$current_branch" ]] && current_branch="main"

    info "Current branch: $current_branch"

    # Fetch latest
    git fetch origin

    # Check for updates
    local behind
    behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")

    if [[ "$behind" == "0" ]]; then
        success "Already up to date"
        return 0
    fi

    info "Updates available: $behind commits behind"

    # Pull
    git pull origin "$current_branch"

    success "Pulled latest changes"
    return 0
}

update_submodules() {
    info "Updating submodules..."

    if [[ -f ".gitmodules" ]]; then
        git submodule update --init --recursive
        success "Submodules updated"
    else
        info "No submodules found"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════════════

rebuild_forgenexus() {
    info "Rebuilding ForgeNexus..."

    local fn_dir="${FORGEWRIGHT_DIR}/forgenexus"

    if [[ ! -d "$fn_dir" ]]; then
        warn "ForgeNexus directory not found"
        return 1
    fi

    cd "$fn_dir"

    # Install deps
    npm install --prefer-offline 2>&1 | tail -3 || true

    # Build
    npm run build 2>&1 | tail -5

    success "ForgeNexus rebuilt"

    cd "$FORGEWRIGHT_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MIGRATION
# ═══════════════════════════════════════════════════════════════════════════════

check_migration_needed() {
    local project_root="$1"

    # Check if project has old SQLite index
    local sqlite_db="${project_root}/.gitnexus/codebase.db"
    local kuzu_db="${project_root}/.forgenexus/codebase.db"

    if [[ -f "$sqlite_db" ]] && [[ ! -f "$kuzu_db" ]]; then
        echo "sqlite"
        return 0
    fi

    return 1
}

run_migration() {
    local project_root="$1"

    info "Running SQLite → KuzuDB migration..."

    local sqlite_db="${project_root}/.gitnexus/codebase.db"
    local kuzu_db="${project_root}/.forgenexus/codebase.db"

    # Check if migration script exists
    local migration_script="${FORGEWRIGHT_DIR}/forgenexus/scripts/migrate-sqlite-to-kuzu.js"

    if [[ ! -f "$migration_script" ]]; then
        warn "Migration script not found"
        return 1
    fi

    # Run migration
    cd "${FORGEWRIGHT_DIR}/forgenexus"

    if [[ -f "$sqlite_db" ]]; then
        info "Migrating: $sqlite_db → $kuzu_db"
        node "$migration_script" "$sqlite_db" "$kuzu_db" || {
            warn "Migration failed, will re-index from scratch"
            return 1
        }
        success "Migration complete"
    fi

    cd "$FORGEWRIGHT_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# INDEXING
# ═══════════════════════════════════════════════════════════════════════════════

reindex_project() {
    local project_root="$1"

    info "Re-indexing project: $project_root"

    cd "${FORGEWRIGHT_DIR}/forgenexus"

    # Force re-index
    npx forgenexus analyze --force "$project_root" 2>&1 | tail -20

    success "Re-index complete"

    cd "$FORGEWRIGHT_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# UPDATE ALL PROJECT INDICES
# ═══════════════════════════════════════════════════════════════════════════════

update_all_indices() {
    info "Finding projects with ForgeNexus index..."

    # Find all .forgenexus directories
    local indices
    indices=$(find "${HOME}" -name ".forgenexus" -type d 2>/dev/null | head -20)

    if [[ -z "$indices" ]]; then
        info "No indexed projects found"
        return 0
    fi

    local count=0
    for idx in $indices; do
        local project_root
        project_root="$(dirname "$idx")"

        # Skip if it's the forgewright itself
        if [[ "$project_root" == "$FORGEWRIGHT_DIR" ]]; then
            continue
        fi

        ((count++))
        info "[$count] Found: $project_root"

        # Migrate if needed
        if check_migration_needed "$project_root"; then
            warn "Migration needed for: $project_root"
            run_migration "$project_root" || true
        fi

        # Re-index
        reindex_project "$project_root"
    done

    success "Updated $count projects"
}

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK FOR UPDATES
# ═══════════════════════════════════════════════════════════════════════════════

check_updates() {
    info "Checking for updates..."

    cd "$FORGEWRIGHT_DIR"

    if [[ ! -d ".git" ]]; then
        error "Not a git repository"
        return 1
    fi

    local current_branch
    current_branch=$(git branch --show-current)
    [[ -z "$current_branch" ]] && current_branch="main"

    git fetch origin 2>/dev/null || true

    local behind
    behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")

    if [[ "$behind" == "0" ]]; then
        success "ForgeWright is up to date"
    else
        warn "ForgeWright is $behind commits behind origin/${current_branch}"
        info "Run without --check to update"
    fi

    # Check for KuzuDB migration
    local has_sqlite=false
    while IFS= read -r idx; do
        local project_root
        project_root="$(dirname "$idx")"
        if [[ "$project_root" != "$FORGEWRIGHT_DIR" ]] && [[ -f "${project_root}/.gitnexus/codebase.db" ]]; then
            has_sqlite=true
            warn "Found project needing migration: $project_root"
        fi
    done < <(find "${HOME}" -name ".forgenexus" -o -name ".gitnexus" -type d 2>/dev/null | head -20)

    if [[ "$has_sqlite" == "true" ]]; then
        info "Run with --migrate to update databases"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
ForgeWright Updater — Update existing installation

USAGE:
  forgewright-update.sh [OPTIONS]

OPTIONS:
  --check       Check for updates only (don't update)
  --migrate     Run database migration (SQLite → KuzuDB)
  --reindex     Re-index all projects after update
  --all         Update + migrate + reindex everything
  --help        Show this help

EXAMPLES:
  # Check what needs updating
  bash forgewright-update.sh --check

  # Update ForgeWright
  bash forgewright-update.sh

  # Update + migrate databases + reindex
  bash forgewright-update.sh --all
EOF
}

main() {
    local do_migrate=false
    local do_reindex=false
    local do_check=false
    local do_all=false

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)      do_check=true; shift ;;
            --migrate)    do_migrate=true; shift ;;
            --reindex)    do_reindex=true; shift ;;
            --all)        do_all=true; shift ;;
            --help|-h)    show_help; exit 0 ;;
            *)            shift ;;
        esac
    done

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}ForgeWright Updater v${VERSION}${NC}                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check mode
    if [[ "$do_check" == "true" ]]; then
        check_updates
        exit 0
    fi

    # Git pull
    if ! git_pull; then
        error "Git pull failed"
        exit 1
    fi
    echo ""

    # Update submodules
    update_submodules
    echo ""

    # Rebuild ForgeNexus
    rebuild_forgenexus
    echo ""

    # Migration
    if [[ "$do_migrate" == "true" ]] || [[ "$do_all" == "true" ]]; then
        update_all_indices
        echo ""
    fi

    # Re-index
    if [[ "$do_reindex" == "true" ]] || [[ "$do_all" == "true" ]]; then
        reindex_project "${HOME}/Documents"
        echo ""
    fi

    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${GREEN}✓ Update Complete${NC}                                    ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
