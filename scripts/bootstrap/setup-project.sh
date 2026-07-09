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
#   2. Initializes mem0 (.forgewright/memory.jsonl) via mem0-cli.py
#   3. Detects tech stack and generates project-profile.json
#   4. Runs GitNexus analyze to index the project
#   5. Prints the Cursor MCP config snippet (add to ~/.cursor/mcp.json)
#
# Requirements:
#   - Global Forgewright repo must exist at FORGEWRIGHT_PATH (see below)
#   - Node.js >= 18 (for GitNexus)
#   - Git repository (for GitNexus)
# ============================================================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────
# Auto-detect Forgewright root from script location (supports any clone path)
FORGEWRIGHT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# ─────────────────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

# ─── Index with GitNexus ───────────────────────────────────────────────────

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

run_mem0_ensure() {
    if [ "${FORGEWRIGHT_SKIP_MEM0:-}" = "1" ] || [ "${FORGEWRIGHT_SKIP_MEM0:-}" = "true" ]; then
        log_warn "Compliance Policy: Overriding FORGEWRIGHT_SKIP_MEM0. Force-enabling memory."
        export FORGEWRIGHT_SKIP_MEM0=0
    fi
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is required but was not found. Memory initialization aborted."
        exit 1
    fi
    log_info "Ensuring Forgewright memory (mem0)..."
    if bash "${FORGEWRIGHT_PATH}/scripts/ensure-mem0.sh" "$TARGET_PROJECT"; then
        log_ok "mem0 ready (.forgewright/memory.db)"
    else
        log_error "Memory initialization failed. Setup aborted."
        exit 1
    fi
}

update_gitignore() {
    local gitignore_file="${TARGET_PROJECT}/.gitignore"
    log_info "Updating .gitignore in target project..."
    
    # Create .gitignore if it doesn't exist
    if [ ! -f "$gitignore_file" ]; then
        touch "$gitignore_file"
    fi

    # Append Forgewright if not present
    if ! grep -q "memory.db\*" "$gitignore_file" 2>/dev/null; then
        echo "" >> "$gitignore_file"
        echo "# Forgewright local state and binary memory databases" >> "$gitignore_file"
        echo ".forgewright/memory.db*" >> "$gitignore_file"
        echo ".forgewright/session-log.json" >> "$gitignore_file"
        echo ".forgewright/quality-history.json" >> "$gitignore_file"
        echo ".forgewright/quality-report-*.json" >> "$gitignore_file"
        echo ".forgewright/baseline-*.json" >> "$gitignore_file"
        echo ".forgewright/change-manifest-*.json" >> "$gitignore_file"
        log_ok "Added Forgewright local state and memory files to target project's .gitignore"
    fi

    # Append GitNexus if not present
    if ! grep -q "gitnexus/" "$gitignore_file" 2>/dev/null; then
        echo "" >> "$gitignore_file"
        echo "# GitNexus local index databases and code intelligence" >> "$gitignore_file"
        echo ".gitnexus/" >> "$gitignore_file"
        echo ".forgenexus/" >> "$gitignore_file"
        log_ok "Added GitNexus local state and database files to target project's .gitignore"
    fi
}

setup_llm_wiki_integration() {
    log_info "Setting up llm_wiki integration..."
    
    local target_scripts_dir="${TARGET_PROJECT}/scripts"
    mkdir -p "$target_scripts_dir"
    
    # 1. Copy forgewright-wiki-sync.sh to target project scripts
    cp "${FORGEWRIGHT_PATH}/scripts/forgewright-wiki-sync.sh" "${target_scripts_dir}/forgewright-wiki-sync.sh"
    chmod +x "${target_scripts_dir}/forgewright-wiki-sync.sh"
    log_ok "Copied forgewright-wiki-sync.sh to target project"
    
    # 2. Setup Git Hook (Husky or standard git)
    if [ -d "${TARGET_PROJECT}/.husky" ]; then
        local husky_hook="${TARGET_PROJECT}/.husky/post-commit"
        log_info "Husky detected. Adding post-commit hook..."
        cat > "$husky_hook" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.forgewright/project-profile\.json|\.forgewright/code-conventions\.md)'; then
  echo "📄 [Forgewright] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/forgewright-wiki-sync.sh" ]; then
    ./scripts/forgewright-wiki-sync.sh
  fi
fi

# Kiểm tra thay đổi logic files để chạy gitnexus analyze và cập nhật sequence flow
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [Forgewright] Phát hiện thay đổi logic files. Đang chạy gitnexus analyze và cập nhật sequence flow..."
  npx gitnexus analyze
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$husky_hook"
        log_ok "Husky post-commit hook configured: .husky/post-commit"
    elif [ -d "${TARGET_PROJECT}/.git" ]; then
        local git_hook="${TARGET_PROJECT}/.git/hooks/post-commit"
        log_info "Standard Git detected. Adding post-commit hook..."
        cat > "$git_hook" <<'EOF'
#!/bin/sh
# Auto-generated by Forgewright Setup

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.forgewright/project-profile\.json|\.forgewright/code-conventions\.md)'; then
  echo "📄 [Forgewright] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/forgewright-wiki-sync.sh" ]; then
    ./scripts/forgewright-wiki-sync.sh
  fi
fi

# Kiểm tra thay đổi logic files để chạy gitnexus analyze và cập nhật sequence flow
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [Forgewright] Phát hiện thay đổi logic files. Đang chạy gitnexus analyze và cập nhật sequence flow..."
  npx gitnexus analyze
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$git_hook"
        log_ok "Git post-commit hook configured: .git/hooks/post-commit"
    else
        log_warn "Git repository not found. Skipping git hook installation."
    fi
}

setup_submodule_auto_update() {
    log_info "Setting up submodule auto-update hooks..."
    
    # 1. Setup post-commit hook (appends check with --pull)
    if [ -d "${TARGET_PROJECT}/.husky" ]; then
        local husky_hook="${TARGET_PROJECT}/.husky/post-commit"
        log_info "Husky detected. Configuring post-commit with submodule check..."
        cat > "$husky_hook" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# ⚡ Tự động check và update submodule Forgewright khi commit
if [ -f "forgewright/scripts/forgewright-submodule-check.sh" ]; then
  bash forgewright/scripts/forgewright-submodule-check.sh --pull
fi

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.forgewright/project-profile\.json|\.forgewright/code-conventions\.md)'; then
  echo "📄 [Forgewright] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/forgewright-wiki-sync.sh" ]; then
    ./scripts/forgewright-wiki-sync.sh
  fi
fi

# Kiểm tra thay đổi logic files để chạy gitnexus analyze và cập nhật sequence flow
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [Forgewright] Phát hiện thay đổi logic files. Đang chạy gitnexus analyze và cập nhật sequence flow..."
  npx gitnexus analyze
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$husky_hook"
        
        # Setup post-merge hook
        local husky_merge="${TARGET_PROJECT}/.husky/post-merge"
        log_info "Husky detected. Adding post-merge hook..."
        cat > "$husky_merge" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# ⚡ Tự động check và update submodule Forgewright khi pull/merge
if [ -f "forgewright/scripts/forgewright-submodule-check.sh" ]; then
  bash forgewright/scripts/forgewright-submodule-check.sh --pull
fi
EOF
        chmod +x "$husky_merge"
        log_ok "Husky hooks configured: post-commit, post-merge"
        
    elif [ -d "${TARGET_PROJECT}/.git" ]; then
        local git_hook="${TARGET_PROJECT}/.git/hooks/post-commit"
        log_info "Standard Git detected. Configuring post-commit with submodule check..."
        cat > "$git_hook" <<'EOF'
#!/bin/sh
# Auto-generated by Forgewright Setup

# ⚡ Tự động check và update submodule Forgewright khi commit
if [ -f "forgewright/scripts/forgewright-submodule-check.sh" ]; then
  bash forgewright/scripts/forgewright-submodule-check.sh --pull
fi

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.forgewright/project-profile\.json|\.forgewright/code-conventions\.md)'; then
  echo "📄 [Forgewright] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/forgewright-wiki-sync.sh" ]; then
    ./scripts/forgewright-wiki-sync.sh
  fi
fi

# Kiểm tra thay đổi logic files để chạy gitnexus analyze và cập nhật sequence flow
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [Forgewright] Phát hiện thay đổi logic files. Đang chạy gitnexus analyze và cập nhật sequence flow..."
  npx gitnexus analyze
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$git_hook"
        
        # Setup post-merge hook
        local git_merge="${TARGET_PROJECT}/.git/hooks/post-merge"
        log_info "Standard Git detected. Adding post-merge hook..."
        cat > "$git_merge" <<'EOF'
#!/bin/sh
# Auto-generated by Forgewright Setup

# ⚡ Tự động check và update submodule Forgewright khi pull/merge
if [ -f "forgewright/scripts/forgewright-submodule-check.sh" ]; then
  bash forgewright/scripts/forgewright-submodule-check.sh --pull
fi
EOF
        chmod +x "$git_merge"
        log_ok "Git hooks configured: post-commit, post-merge"
    else
        log_warn "Git repository not found. Skipping git hook installation."
    fi
}

main() {
    check_prerequisites
    create_forgewright_dir
    run_mem0_ensure
    update_gitignore
    setup_llm_wiki_integration
    setup_submodule_auto_update
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
    echo -e "  Run ${CYAN}gitnexus analyze${NC} in this project anytime."
    echo ""
}

main "$@"
