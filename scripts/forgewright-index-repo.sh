#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# forgewright-index-repo — Quick index a repo with GitNexus
#
# USAGE:
#   bash forgewright/scripts/forgewright-index-repo.sh [path]
#   bash forgewright/scripts/forgewright-index-repo.sh --all
#
# OPTIONS:
#   --all    Index all Git repos in ~/GitHub
#   --new    Index only new repos (not already indexed)
#   --help   Show this help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_info()  { echo -e "  $1"; }

# ─── Main ────────────────────────────────────────────────────────────

main() {
    local mode="${1:-}"

    case "$mode" in
        --all)
            echo "━━━ Indexing all repos ━━━"
            echo ""
            for dir in "$HOME/GitHub" "$HOME/Documents/GitHub" "$HOME/Projects"; do
                if [[ -d "$dir" ]]; then
                    find "$dir" -maxdepth 3 -type d -name ".git" 2>/dev/null | while read -r git_dir; do
                        repo="$(dirname "$git_dir")"
                        name="$(basename "$repo")"
                        echo -n "Indexing $name... "
                        if gitnexus analyze "$repo" > /dev/null 2>&1; then
                            echo -e "${GREEN}✓${NC}"
                        else
                            echo -e "${YELLOW}⚠${NC}"
                        fi
                    done
                fi
            done
            echo ""
            echo "Done. Run 'gitnexus list' to see all indexed repos."
            ;;
        --new)
            echo "━━━ Indexing new repos ━━━"
            echo ""
            for dir in "$HOME/GitHub" "$HOME/Documents/GitHub"; do
                if [[ -d "$dir" ]]; then
                    find "$dir" -maxdepth 3 -type d -name ".git" 2>/dev/null | while read -r git_dir; do
                        repo="$(dirname "$git_dir")"
                        name="$(basename "$repo")"
                        if ! gitnexus list 2>/dev/null | grep -q "$name"; then
                            echo -n "Indexing $name... "
                            if gitnexus analyze "$repo" > /dev/null 2>&1; then
                                echo -e "${GREEN}✓${NC}"
                            else
                                echo -e "${YELLOW}⚠${NC}"
                            fi
                        else
                            echo "Already indexed: $name"
                        fi
                    done
                fi
            done
            ;;
        --help|-h)
            cat << 'EOF'
forgewright-index-repo — Quick index a repo with GitNexus

USAGE:
  forgewright-index-repo.sh [path]     Index specific repo
  forgewright-index-repo.sh --all     Index all repos in ~/GitHub
  forgewright-index-repo.sh --new     Index only new repos

EXAMPLES:
  # Index current directory
  cd ~/GitHub/my-project && bash forgewright/scripts/forgewright-index-repo.sh

  # Index all repos
  bash forgewright/scripts/forgewright-index-repo.sh --all

  # Index only new repos
  bash forgewright/scripts/forgewright-index-repo.sh --new

EOF
            ;;
        "")
            # Index current directory
            repo="$(pwd)"
            name="$(basename "$repo")"
            echo "Indexing $name..."
            if gitnexus analyze "$repo" > /dev/null 2>&1; then
                log_ok "Indexed successfully"
            else
                log_warn "Failed or already indexed"
            fi
            ;;
        *)
            # Index specific path
            repo="$1"
            if [[ ! -d "$repo" ]]; then
                echo "ERROR: Directory not found: $repo" >&2
                exit 1
            fi
            name="$(basename "$repo")"
            echo "Indexing $name..."
            if gitnexus analyze "$repo" > /dev/null 2>&1; then
                log_ok "Indexed successfully"
            else
                log_warn "Failed or already indexed"
            fi
            ;;
    esac
}

main "$@"
