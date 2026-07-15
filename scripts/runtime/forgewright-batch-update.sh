#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Forgewright Batch Submodule Updater
# ═══════════════════════════════════════════════════════════════════════════════
# Updates all projects that use Forgewright as a git submodule.
#
# Usage:
#   bash scripts/forgewright-batch-update.sh                 # Check all (dry-run)
#   bash scripts/forgewright-batch-update.sh --pull           # Auto-pull updates
#   bash scripts/forgewright-batch-update.sh --pull --commit  # Pull + auto-commit
#   bash scripts/forgewright-batch-update.sh --install-hooks  # Install git hooks
#
# Scans: ~/GitHub, ~/Documents/GitHub (customizable via SCAN_DIRS env var)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}➜${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }
header()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BOLD}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# Config
SCAN_DIRS="${SCAN_DIRS:-$HOME/GitHub $HOME/Documents/GitHub}"
DO_PULL=false
DO_COMMIT=false
INSTALL_HOOKS=false

# Parse args
for arg in "$@"; do
    case "$arg" in
        --pull) DO_PULL=true ;;
        --commit) DO_COMMIT=true ;;
        --install-hooks) INSTALL_HOOKS=true ;;
        --help|-h)
            echo "Usage: bash $0 [--pull] [--commit] [--install-hooks]"
            echo ""
            echo "  --pull           Auto-pull Forgewright updates in all projects"
            echo "  --commit         Auto-commit submodule pointer update (requires --pull)"
            echo "  --install-hooks  Install post-merge/post-checkout hooks in all projects"
            echo ""
            echo "Environment:"
            echo "  SCAN_DIRS        Space-separated dirs to scan (default: ~/GitHub ~/Documents/GitHub)"
            exit 0
            ;;
    esac
done

# ═══════════════════════════════════════════════════════════════════════════════
# Install hooks mode
# ═══════════════════════════════════════════════════════════════════════════════
if $INSTALL_HOOKS; then
    header "Installing Auto-Update Hooks"
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    hook_installer="$script_dir/../lite/install-submodule-update-hooks.sh"
    if [[ ! -x "$hook_installer" ]]; then
        error "Hook installer not found: $hook_installer"
        exit 2
    fi

    count=0
    for scan_dir in $SCAN_DIRS; do
        [[ ! -d "$scan_dir" ]] && continue
        while IFS= read -r gitmodules; do
            project_dir="$(dirname "$gitmodules")"
            project_name="$(basename "$project_dir")"
            if bash "$hook_installer" "$project_dir" >/dev/null; then
                success "$project_name: post-merge/post-checkout hooks installed"
                ((count+=1))
            else
                warn "$project_name: hook installation failed"
            fi
        done < <(find "$scan_dir" -maxdepth 3 -name ".gitmodules" -exec grep -l "forgewright" {} \; 2>/dev/null)
    done

    echo ""
    success "Installed hooks in $count projects."
    info "After git pull or checkout, each project will auto-check Forgewright and refresh its installed runtime."
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Batch update mode
# ═══════════════════════════════════════════════════════════════════════════════
header "Forgewright Batch Submodule Updater"

if $DO_PULL; then
    info "Mode: ${GREEN}AUTO-PULL${NC} (will update all projects)"
else
    info "Mode: ${YELLOW}DRY-RUN${NC} (check only, use --pull to update)"
fi

# Get latest Forgewright commit for reference
FW_LATEST=""
if [[ -d "$HOME/GitHub/forgewright/.git" ]]; then
    FW_LATEST=$(cd "$HOME/GitHub/forgewright" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    info "Forgewright latest: ${GREEN}$FW_LATEST${NC}"
fi

echo ""

updated=0
skipped=0
behind_total=0
projects_found=0

for scan_dir in $SCAN_DIRS; do
    [[ ! -d "$scan_dir" ]] && continue

    while IFS= read -r gitmodules; do
        project_dir="$(dirname "$gitmodules")"
        project_name="$(basename "$project_dir")"
        ((projects_found+=1))

        # Find submodule path
        submodule_dir=$(
            git -C "$project_dir" config --file .gitmodules --name-only --get-regexp '^submodule\..*\.path$' 2>/dev/null |
            while IFS= read -r path_key; do
                path_value=$(git -C "$project_dir" config --file .gitmodules --get "$path_key" 2>/dev/null || true)
                if printf '%s' "$path_value" | grep -qi forgewright; then
                    printf '%s\n' "$path_value"
                    break
                fi
            done
        )
        if [[ -z "$submodule_dir" ]]; then
            submodule_dir=$(
                git -C "$project_dir" config --file .gitmodules --name-only --get-regexp '^submodule\..*\.url$' 2>/dev/null |
                while IFS= read -r url_key; do
                    url_value=$(git -C "$project_dir" config --file .gitmodules --get "$url_key" 2>/dev/null || true)
                    if printf '%s' "$url_value" | grep -qi forgewright; then
                        git -C "$project_dir" config --file .gitmodules --get "${url_key%.url}.path" 2>/dev/null || true
                        break
                    fi
                done
            )
        fi
        [[ -z "$submodule_dir" ]] && submodule_dir="forgewright"

        full_submodule_path="$project_dir/$submodule_dir"

        # Check if submodule is initialized
        if [[ ! -d "$full_submodule_path/.git" ]] && [[ ! -f "$full_submodule_path/.git" ]]; then
            warn "${BOLD}$project_name${NC}: Submodule not initialized (run: cd $project_dir && git submodule update --init)"
            ((skipped+=1))
            continue
        fi

        # Check submodule status
        cd "$full_submodule_path"

        # Check for local changes
        if [[ -n "$(git status --porcelain --untracked-files=normal 2>/dev/null)" ]]; then
            warn "${BOLD}$project_name${NC}: Has local changes, skipping"
            ((skipped+=1))
            cd "$project_dir"
            continue
        fi

        # Fetch remote
        git fetch origin >/dev/null 2>&1 || {
            warn "${BOLD}$project_name${NC}: Fetch failed (offline?)"
            ((skipped+=1))
            cd "$project_dir"
            continue
        }

        current_branch=$(git branch --show-current 2>/dev/null || echo "")
        [[ -z "$current_branch" ]] && current_branch="main"

        behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")
        current_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "???")

        if [[ "$behind" -gt 0 ]]; then
            behind_total=$((behind_total + behind))

            if $DO_PULL; then
                cd "$project_dir"
                git submodule update --remote --merge "$submodule_dir" >/dev/null 2>&1
                new_sha=$(cd "$full_submodule_path" && git rev-parse --short HEAD 2>/dev/null || echo "???")
                success "${BOLD}$project_name${NC}: Updated ${RED}$current_sha${NC} → ${GREEN}$new_sha${NC} ($behind commits)"

                # Auto-commit if requested
                if $DO_COMMIT; then
                    cd "$project_dir"
                    git add "$submodule_dir"
                    git commit -m "chore: update forgewright submodule to $new_sha" --no-verify >/dev/null 2>&1 || true
                    info "  Committed submodule pointer update"
                fi

                ((updated+=1))
            else
                warn "${BOLD}$project_name${NC}: ${RED}$behind commits behind${NC} (at $current_sha)"
            fi
        else
            success "${BOLD}$project_name${NC}: Up to date ($current_sha)"
        fi

        cd "$project_dir" 2>/dev/null || true

    done < <(find "$scan_dir" -maxdepth 3 -name ".gitmodules" -exec grep -l "forgewright" {} \; 2>/dev/null)
done

# Summary
echo ""
header "Summary"
info "Projects scanned: $projects_found"
if $DO_PULL; then
    success "Updated: $updated"
else
    [[ $behind_total -gt 0 ]] && warn "Behind: $behind_total total commits across projects"
fi
[[ $skipped -gt 0 ]] && warn "Skipped: $skipped (local changes or uninitialized)"
echo ""

if ! $DO_PULL && [[ $behind_total -gt 0 ]]; then
    info "Run with ${GREEN}--pull${NC} to auto-update all projects:"
    info "  bash scripts/forgewright-batch-update.sh --pull"
    info ""
    info "Run with ${GREEN}--pull --commit${NC} to also commit the changes:"
    info "  bash scripts/forgewright-batch-update.sh --pull --commit"
fi
