#!/bin/bash
# ============================================================================
# Forgewright Global Setup — Link any project to the global Forgewright repo
#
# This script sets up Forgewright in ANY project WITHOUT needing a git submodule.
# It links to the global Forgewright repo at a fixed path.
#
# Usage:
#   ./forgewright/scripts/setup-project.sh           # Setup current directory
#   ./forgewright/scripts/setup-project.sh /path/to/project  # Setup specific project
#
# What it does:
#   1. Creates .forgewright/ directory in the target project
#   2. Detects tech stack and generates project-profile.json
#   3. Runs GitNexus analyze to index the project
#   4. Prints the Cursor MCP config snippet (add to ~/.cursor/mcp.json)
#
# Requirements:
#   - Global Forgewright repo must exist at FORGEWRIGHT_PATH (see below)
#   - Node.js >= 18 (for GitNexus)
#   - Git repository (for GitNexus)
# ============================================================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────
# Auto-detect Forgewright root from script location (supports any clone path)
FORGEWRIGHT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# ─────────────────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ${NC} $1"; }
log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  Forgewright — Global Project Setup                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─── Detect Target Project ────────────────────────────────────────────────

TARGET_PROJECT="${1:-$(pwd)}"

# Resolve to absolute path
if [ "$TARGET_PROJECT" = "." ] || [ -z "$TARGET_PROJECT" ]; then
    TARGET_PROJECT="$(pwd)"
fi

TARGET_PROJECT="$(cd "$TARGET_PROJECT" && pwd)"

# ─── Validate Prerequisites ───────────────────────────────────────────────

check_prerequisites() {
    print_header
    
    log_info "Target project: ${TARGET_PROJECT}"
    echo ""

    # Check Forgewright exists
    if [ ! -d "$FORGEWRIGHT_PATH" ]; then
        log_error "Forgewright repo not found at: ${FORGEWRIGHT_PATH}"
        log_info "Edit FORGEWRIGHT_PATH in this script to point to your Forgewright repo."
        exit 1
    fi
    log_ok "Forgewright repo found"

    # Check skills directory
    if [ ! -d "$FORGEWRIGHT_PATH/skills" ]; then
        log_error "Forgewright skills directory not found."
        exit 1
    fi
    log_ok "Skills directory found ($(find "$FORGEWRIGHT_PATH/skills" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d '[:space:]') skills)"

    # Check git repo
    if ! git -C "$TARGET_PROJECT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        log_warn "Not a git repository. GitNexus indexing will be limited."
        log_info "Run 'git init' first if you want full code intelligence."
    else
        log_ok "Git repository detected"
    fi

    # Check Node.js
    if command -v node &> /dev/null; then
        log_ok "Node.js: $(node --version)"
    else
        log_warn "Node.js not found. GitNexus will not work."
        log_info "Install Node.js >= 18 for code intelligence."
    fi

    echo ""
}

# ─── Detect Tech Stack ───────────────────────────────────────────────────

detect_tech_stack() {
    local lang="unknown"
    local framework="unknown"
    local project_name
    project_name=$(basename "$TARGET_PROJECT")

    # Detect language/framework from files
    if [ -f "$TARGET_PROJECT/package.json" ]; then
        local pkg_type
        pkg_type=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$TARGET_PROJECT/package.json','utf8')).type||'commonjs')}catch{console.log('commonjs')}" 2>/dev/null)
        if [ -f "$TARGET_PROJECT/tsconfig.json" ]; then
            lang="typescript"
        else
            lang="javascript"
        fi
        # Detect framework from package.json
        local deps
        deps=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$TARGET_PROJECT/package.json','utf8'));const d={...p.dependencies,...p.devDependencies};console.log(Object.keys(d).join(','))}catch{console.log('')}" 2>/dev/null)
        case "$deps" in
            *next*) framework="nextjs" ;;
            *nuxt*) framework="nuxt" ;;
            *express*) framework="express" ;;
            *fastify*) framework="fastify" ;;
            *nest*) framework="nestjs" ;;
            *react*) framework="react" ;;
            *vue*) framework="vue" ;;
            *angular*) framework="angular" ;;
            *flask*) framework="flask" ;;
            *django*) framework="django" ;;
            *fastapi*) framework="fastapi" ;;
            *gin*) framework="gin" ;;
            *fiber*) framework="fiber" ;;
            *spring*) framework="spring" ;;
            *) framework="node" ;;
        esac
    elif [ -f "$TARGET_PROJECT/go.mod" ]; then
        lang="go"
        framework="go"
    elif [ -f "$TARGET_PROJECT/requirements.txt" ] || [ -f "$TARGET_PROJECT/pyproject.toml" ]; then
        lang="python"
        framework="django"
    elif [ -f "$TARGET_PROJECT/Cargo.toml" ]; then
        lang="rust"
        framework="rust"
    elif [ -f "$TARGET_PROJECT/pom.xml" ] || [ -f "$TARGET_PROJECT/build.gradle" ]; then
        lang="java"
        framework="spring"
    elif [ -f "$TARGET_PROJECT/*.csproj" ] || [ -f "$TARGET_PROJECT/Unity*" ]; then
        lang="csharp"
        framework="unity"
    fi

    echo "$lang $framework"
}

# ─── Create .forgewright Directory ──────────────────────────────────────

create_forgewright_dir() {
    local fw_dir="$TARGET_PROJECT/.forgewright"
    
    if [ -d "$fw_dir" ]; then
        log_warn ".forgewright/ already exists in this project"
        log_info "Skipping profile generation."
        return
    fi

    log_info "Creating .forgewright/ directory..."
    mkdir -p "$fw_dir"

    # Detect tech stack
    read -r lang framework <<< "$(detect_tech_stack)"
    local project_name
    project_name=$(basename "$TARGET_PROJECT")

    log_ok "Detected: $lang / $framework"

    # Generate project-profile.json
    cat > "$fw_dir/project-profile.json" <<EOF
{
  "project": "$project_name",
  "language": "$lang",
  "framework": "$framework",
  "projectRoot": "$TARGET_PROJECT",
  "forgewrightRepo": "$FORGEWRIGHT_PATH",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "forgewrightVersion": "$(cat "$FORGEWRIGHT_PATH/VERSION" 2>/dev/null || echo "unknown")"
}
EOF

    log_ok "Generated .forgewright/project-profile.json"
}

# ─── Index with GitNexus ─────────────────────────────────────────────────

run_gitnexus_analyze() {
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found — skipping GitNexus analysis."
        return
    fi

    if ! git -C "$TARGET_PROJECT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        log_warn "Not a git repo — skipping GitNexus."
        return
    fi

    log_info "Running GitNexus analysis..."
    if npx --yes gitnexus analyze "$TARGET_PROJECT" > /dev/null 2>&1; then
        log_ok "GitNexus analysis complete"
    else
        log_warn "GitNexus analysis failed. Install with: npm install -g gitnexus"
    fi
}

# ─── Print Cursor MCP Config ─────────────────────────────────────────────

print_cursor_config() {
    echo ""
    echo -e " ${YELLOW}Cursor MCP Config${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Your global forgewright MCP is already configured at:"
    echo "  ${CYAN}~/.cursor/mcp.json${NC}"
    echo ""
    echo "  MCP server path: ${FORGEWRIGHT_PATH}/mcp/build/index.js"
    echo ""
    echo "  ⚠️  Restart Cursor for MCP changes to take effect."
    echo ""
}

# ─── Main ───────────────────────────────────────────────────────────────

main() {
    check_prerequisites
    create_forgewright_dir
    run_gitnexus_analyze
    print_cursor_config

    echo ""
    log_ok "Setup complete!"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  1. Restart Cursor (required for MCP server)"
    echo -e "  2. Type '${CYAN}/forgewright${NC}' in Cursor chat to activate the skill"
    echo -e "  3. Say '${CYAN}Build a production-grade SaaS for [your idea]${NC}'"
    echo ""
    echo -e "  ${BOLD}For GitNexus code intelligence:${NC}"
    echo -e "  Run ${CYAN}npx gitnexus analyze${NC} in this project anytime."
    echo ""
}

main "$@"
