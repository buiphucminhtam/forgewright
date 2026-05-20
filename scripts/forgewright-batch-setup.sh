#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgewright-batch-setup — Setup ALL projects with Forgewright MCP
#
# Automatically detects all git repos and sets up Forgewright for each.
# Also indexes each project with GitNexus for code intelligence.
#
# USAGE:
#   bash forgewright/scripts/forgewright-batch-setup.sh [OPTIONS]
#
# OPTIONS:
#   --dry-run      Show what would be done without doing it
#   --skip-gitnexus  Skip GitNexus indexing
#   --force        Re-setup even if already configured
#   --parallel     Run setup in parallel (faster but noisier)
#   --projects     List only detected projects
#   --help         Show this help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()  { echo -e "${BLUE}  ➜${NC} $1"; }
log_ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
log_error() { echo -e "${RED}  ✗${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Detect Forgewright Location ─────────────────────────────────────

FORGEWRIGHT_DIR=""
FORGEWRIGHT_SETUP_SCRIPT=""

detect_forgewright() {
    local script_path="${BASH_SOURCE[0]}"
    local resolved

    # Resolve BASH_SOURCE[0] to absolute path
    if [[ "$script_path" == /* ]]; then
        resolved="$(cd "$(dirname "$script_path")" && pwd -P)"
    else
        resolved="$(cd "$PWD" && cd "$(dirname "$script_path")" && pwd -P)"
    fi

    # If this script is in scripts/ under forgewright root
    if [[ "$resolved" == */scripts ]]; then
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
    elif [[ "$resolved" == */.antigravity/plugins/production-grade/scripts ]]; then
        FORGEWRIGHT_DIR="$(dirname "$(dirname "$(dirname "$(dirname "$resolved")")")")"
    else
        FORGEWRIGHT_DIR="$(dirname "$resolved")"
    fi

    # Find the setup script
    if [[ -f "${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-setup.sh" ]]; then
        FORGEWRIGHT_SETUP_SCRIPT="${FORGEWRIGHT_DIR}/scripts/forgewright-mcp-setup.sh"
    elif [[ -f "${FORGEWRIGHT_DIR}/scripts/fw-mcp.sh" ]]; then
        FORGEWRIGHT_SETUP_SCRIPT="${FORGEWRIGHT_DIR}/scripts/fw-mcp.sh"
    fi

    if [[ -z "$FORGEWRIGHT_SETUP_SCRIPT" ]]; then
        echo "ERROR: Could not find forgewright-mcp-setup.sh" >&2
        exit 1
    fi
}

# ─── Find All Git Repos ──────────────────────────────────────────────

find_git_repos() {
    local base_dir="${1:-}"
    local depth="${2:-2}"

    if [[ -z "$base_dir" ]]; then
        # Default to common locations
        for dir in "$HOME/GitHub" "$HOME/Documents/GitHub" "$HOME/Projects"; do
            if [[ -d "$dir" ]]; then
                base_dir="$dir"
                break
            fi
        done
    fi

    if [[ -z "$base_dir" ]] || [[ ! -d "$base_dir" ]]; then
        echo "ERROR: Could not find base directory for projects" >&2
        exit 1
    fi

    # Find all directories with .git
    find "$base_dir" -maxdepth "$depth" -type d -name ".git" 2>/dev/null | while read -r git_dir; do
        dirname "$git_dir"
    done
}

# ─── Check if Project Needs Setup ────────────────────────────────────

needs_setup() {
    local project_dir="$1"
    local force="${2:-false}"

    if [[ "$force" == "true" ]]; then
        return 0  # Force means always needs setup
    fi

    # Check if already set up
    if [[ -f "${project_dir}/.antigravity/mcp-manifest.json" ]]; then
        return 1  # Already set up
    fi

    if [[ -f "${project_dir}/.forgewright/mcp-server/server.ts" ]]; then
        return 1  # Already set up
    fi

    return 0  # Needs setup
}

# ─── Setup Single Project ─────────────────────────────────────────────

setup_project() {
    local project_dir="$1"
    local project_name
    project_name="$(basename "$project_dir")"
    local skip_gitnexus="${FORGEWRIGHT_SKIP_GITNEXUS:-false}"

    log_step "Setting up $project_name..."

    # Change to project directory
    if ! cd "$project_dir" 2>/dev/null; then
        log_error "Cannot access $project_dir"
        return 1
    fi

    # Run setup
    local setup_cmd="bash '$FORGEWRIGHT_SETUP_SCRIPT'"
    if [[ "$FORGEWRIGHT_SKIP_GITNEXUS" == "true" ]]; then
        # Can't skip gitnexus via setup script, we'll do it manually
        :
    fi

    if eval "$setup_cmd" > /dev/null 2>&1; then
        log_ok "$project_name: MCP setup complete"
    else
        log_warn "$project_name: MCP setup had issues (continuing)"
    fi

    # Index with GitNexus
    if [[ "$skip_gitnexus" != "true" ]] && command -v gitnexus &> /dev/null; then
        log_info "  Indexing with GitNexus..."
        if gitnexus analyze "$project_dir" > /dev/null 2>&1; then
            log_ok "  $project_name: GitNexus indexed"
        else
            log_warn "  $project_name: GitNexus indexing failed"
        fi
    fi

    # Return to original directory
    cd - > /dev/null || true
}

# ─── Show Help ─────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
forgewright-batch-setup — Setup ALL projects with Forgewright MCP

USAGE:
  forgewright-batch-setup.sh [OPTIONS]

OPTIONS:
  --dry-run        Show what would be done without doing it
  --skip-gitnexus  Skip GitNexus indexing (faster)
  --force          Re-setup even if already configured
  --parallel       Run setup in parallel for faster results
  --projects       List detected projects only
  --base-dir PATH  Base directory to scan (default: ~/GitHub)
  --depth N        Directory depth to scan (default: 2)
  --help           Show this help

EXAMPLES:
  # Setup all projects
  bash forgewright/scripts/forgewright-batch-setup.sh

  # Show what would be done
  bash forgewright/scripts/forgewright-batch-setup.sh --dry-run

  # Setup with GitNexus indexing (default)
  bash forgewright/scripts/forgewright-batch-setup.sh

  # Skip GitNexus (faster)
  bash forgewright/scripts/forgewright-batch-setup.sh --skip-gitnexus

  # Force re-setup all projects
  bash forgewright/scripts/forgewright-batch-setup.sh --force

  # Scan specific directory
  bash forgewright/scripts/forgewright-batch-setup.sh --base-dir ~/Projects --depth 3

EOF
}

# ─── Main ─────────────────────────────────────────────────────────────

main() {
    local dry_run=false
    local skip_gitnexus=false
    local force=false
    local parallel=false
    local list_projects=false
    local base_dir=""
    local depth=2
    local projects=()

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)        dry_run=true; shift ;;
            --skip-gitnexus)  skip_gitnexus=true; export FORGEWRIGHT_SKIP_GITNEXUS=true; shift ;;
            --force)          force=true; shift ;;
            --parallel)        parallel=true; shift ;;
            --projects)        list_projects=true; shift ;;
            --base-dir)        base_dir="$2"; shift 2 ;;
            --depth)           depth="$2"; shift 2 ;;
            --help|-h)        show_help; exit 0 ;;
            *)                 shift ;;
        esac
    done

    # Detect forgewright
    detect_forgewright

    echo ""
    echo -e "${CYAN}⚡ Forgewright Batch Setup${NC}"
    echo ""

    # Find all repos
    log_step "Scanning for git repositories..."
    if [[ -n "$base_dir" ]]; then
        while IFS= read -r repo; do
            projects+=("$repo")
        done < <(find_git_repos "$base_dir" "$depth")
    else
        # Scan common locations
        for dir in "$HOME/GitHub" "$HOME/Documents/GitHub" "$HOME/Projects"; do
            if [[ -d "$dir" ]]; then
                while IFS= read -r repo; do
                    projects+=("$repo")
                done < <(find_git_repos "$dir" "$depth")
            fi
        done
    fi

    if [[ ${#projects[@]} -eq 0 ]]; then
        log_error "No git repositories found"
        exit 1
    fi

    log_ok "Found ${#projects[@]} repository(s)"
    echo ""

    # List projects
    echo "━━━ Detected Projects ━━━"
    echo ""
    local need_setup=()
    for project in "${projects[@]}"; do
        local name
        name="$(basename "$project")"
        local status="  ✓ Already configured"
        if needs_setup "$project" "$force"; then
            status="${YELLOW}  ○ Needs setup${NC}"
            need_setup+=("$project")
        fi
        echo "  $name"
        echo -e "    $status"
        echo "    $project"
        echo ""
    done
    echo "━━━━━━━━━━━━━━━━━━"
    echo ""

    if [[ "$list_projects" == "true" ]]; then
        exit 0
    fi

    if [[ ${#need_setup[@]} -eq 0 ]]; then
        log_ok "All projects are already configured!"
        echo ""
        echo "Run with --force to re-setup all projects"
        exit 0
    fi

    echo "━━━ Setting Up Projects ━━━"
    echo ""

    if [[ "$dry_run" == "true" ]]; then
        log_info "DRY RUN - Would setup ${#need_setup[@]} project(s):"
        for project in "${need_setup[@]}"; do
            echo "  - $(basename "$project")"
        done
        echo ""
        exit 0
    fi

    local success=0
    local failed=0

    if [[ "$parallel" == "true" ]]; then
        # Parallel execution
        for project in "${need_setup[@]}"; do
            (
                setup_project "$project" || true
            ) &
        done
        wait
    else
        # Sequential execution
        for project in "${need_setup[@]}"; do
            if setup_project "$project"; then
                ((success++))
            else
                ((failed++))
            fi
            echo ""
        done
    fi

    echo "━━━ Summary ━━━"
    echo ""
    log_ok "Successfully set up: $success"
    if [[ $failed -gt 0 ]]; then
        log_warn "Failed: $failed"
    fi
    echo ""
    echo "━━━━━━━━━━━━━━━━━━"
    echo ""

    if [[ $success -gt 0 ]]; then
        echo "Restart your AI client to activate Forgewright MCP"
        echo "for the newly configured projects."
        echo ""
    fi
}

main "$@"
