#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Forgewright MCP Server Generator (Standalone)
#
# Generates .forgewright/mcp-server/ from templates.
# No AI session required — runs from CLI directly.
#
# Usage:
#   ./forgewright/scripts/mcp-generate.sh          (from project root)
#   ./scripts/mcp-generate.sh                      (from forgewright dir)
#
# Prerequisites:
#   - Node.js >= 18
#   - GitNexus indexed (.gitnexus/ exists)
#   - project-profile.json exists (run /onboard first time)
# ─────────────────────────────────────────────────────────

set -euo pipefail

# ─── Resolve Paths ───────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Detect project root: either parent of forgewright submodule, or forgewright itself
if [ -f "${FORGEWRIGHT_DIR}/../.git" ] || [ -d "${FORGEWRIGHT_DIR}/../.git" ]; then
  PROJECT_ROOT="$(cd "${FORGEWRIGHT_DIR}/.." && pwd)"
else
  PROJECT_ROOT="$FORGEWRIGHT_DIR"
fi

TEMPLATE_DIR="${FORGEWRIGHT_DIR}/skills/mcp-generator/templates"
OUTPUT_DIR="${PROJECT_ROOT}/.forgewright/mcp-server"
PROFILE_FILE="${PROJECT_ROOT}/.forgewright/project-profile.json"

# ─── Colors ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ${NC} $1"; }
log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# ─── Prerequisites ───────────────────────────────────────

check_prerequisites() {
  # Node.js
  if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Install Node.js >= 18 first."
    exit 1
  fi

  # Templates
  if [ ! -f "${TEMPLATE_DIR}/server.ts.hbs" ]; then
    log_error "Templates not found at ${TEMPLATE_DIR}"
    log_info  "Ensure Forgewright submodule is up to date."
    exit 1
  fi

  # GitNexus (optional but recommended)
  if [ ! -d "${PROJECT_ROOT}/.gitnexus" ]; then
    log_warn "GitNexus not indexed. Graph tools will be limited."
    log_info "Run: npx gitnexus analyze ${PROJECT_ROOT}"
  fi

  log_ok "Prerequisites checked"
}

# ─── Read Project Variables ──────────────────────────────

read_project_vars() {
  PROJECT_NAME=$(basename "$PROJECT_ROOT")
  PROJECT_SLUG=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
  GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  FORGEWRIGHT_VERSION="7.0.0"

  # Read from project-profile.json if it exists
  if [ -f "$PROFILE_FILE" ]; then
    PROJECT_LANGUAGE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PROFILE_FILE}','utf8')).language||'Unknown')}catch{console.log('Unknown')}" 2>/dev/null)
    PROJECT_FRAMEWORK=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${PROFILE_FILE}','utf8')).framework||'Unknown')}catch{console.log('Unknown')}" 2>/dev/null)
    log_ok "Read project-profile.json (${PROJECT_LANGUAGE}/${PROJECT_FRAMEWORK})"
  else
    PROJECT_LANGUAGE="Unknown"
    PROJECT_FRAMEWORK="Unknown"
    log_warn "No project-profile.json found. Using defaults."
    log_info "Run /onboard for full project analysis."
  fi

  # Detect package.json scripts
  HAS_TEST="false"
  HAS_LINT="false"
  HAS_BUILD="false"
  if [ -f "${PROJECT_ROOT}/package.json" ]; then
    node -e "const p=JSON.parse(require('fs').readFileSync('${PROJECT_ROOT}/package.json','utf8'));
    if(p.scripts?.test)process.stdout.write('test ');
    if(p.scripts?.lint||p.scripts?.['lint:fix'])process.stdout.write('lint ');
    if(p.scripts?.build)process.stdout.write('build ');" 2>/dev/null | while read -r scripts; do
      echo "$scripts"
    done
    HAS_TEST=$(node -e "const p=JSON.parse(require('fs').readFileSync('${PROJECT_ROOT}/package.json','utf8'));console.log(p.scripts?.test?'true':'false')" 2>/dev/null || echo "false")
    HAS_LINT=$(node -e "const p=JSON.parse(require('fs').readFileSync('${PROJECT_ROOT}/package.json','utf8'));console.log((p.scripts?.lint||p.scripts?.['lint:fix'])?'true':'false')" 2>/dev/null || echo "false")
    HAS_BUILD=$(node -e "const p=JSON.parse(require('fs').readFileSync('${PROJECT_ROOT}/package.json','utf8'));console.log(p.scripts?.build?'true':'false')" 2>/dev/null || echo "false")
  fi

  HAS_CONVENTIONS="false"
  if [ -f "${PROJECT_ROOT}/.forgewright/code-conventions.md" ]; then
    HAS_CONVENTIONS="true"
  fi

  MCP_SERVER_PATH="${OUTPUT_DIR}"
}

# ─── Generate Server ─────────────────────────────────────

generate_server() {
  log_info "Generating MCP server at ${OUTPUT_DIR}..."

  # Clean previous generation
  rm -rf "$OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"

  # Copy and substitute templates
  for template in server.ts.hbs package.json.hbs tsconfig.json.hbs mcp-config.json.hbs; do
    local output_name="${template%.hbs}"
    cp "${TEMPLATE_DIR}/${template}" "${OUTPUT_DIR}/${output_name}"

    # Substitute Handlebars variables
    sed -i '' "s|{{projectName}}|${PROJECT_NAME}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{projectSlug}}|${PROJECT_SLUG}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{generatedAt}}|${GENERATED_AT}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{forgwrightVersion}}|${FORGEWRIGHT_VERSION}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{projectLanguage}}|${PROJECT_LANGUAGE}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{projectFramework}}|${PROJECT_FRAMEWORK}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{mcpServerPath}}|${MCP_SERVER_PATH}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{hasConventions}}|${HAS_CONVENTIONS}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{hasTestCommand}}|${HAS_TEST}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{hasLintCommand}}|${HAS_LINT}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{hasBuildCommand}}|${HAS_BUILD}|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{testCommand}}|npm test|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{lintCommand}}|npm run lint|g" "${OUTPUT_DIR}/${output_name}"
    sed -i '' "s|{{buildCommand}}|npm run build|g" "${OUTPUT_DIR}/${output_name}"

    log_ok "Generated ${output_name}"
  done
}

# ─── Install Dependencies ────────────────────────────────

install_deps() {
  log_info "Installing dependencies..."
  (cd "$OUTPUT_DIR" && npm install --silent 2>&1) || {
    log_error "npm install failed"
    exit 1
  }
  log_ok "Dependencies installed"
}

# ─── Print Summary ───────────────────────────────────────

print_summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e " ${GREEN}✓ MCP Server Generated Successfully${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Project:   ${PROJECT_NAME}"
  echo "  Language:  ${PROJECT_LANGUAGE}"
  echo "  Framework: ${PROJECT_FRAMEWORK}"
  echo "  Output:    ${OUTPUT_DIR}"
  echo "  Tools:     9 active"
  echo "  Resources: 3 active"
  echo "  Prompts:   3 active"
  echo ""
  echo -e " ${YELLOW}To connect your AI client, add:${NC}"
  echo ""
  echo '  {' 
  echo '    "mcpServers": {'
  echo "      \"${PROJECT_SLUG}\": {"
  echo '        "command": "npx",'
  echo "        \"args\": [\"tsx\", \"${OUTPUT_DIR}/server.ts\"]"
  echo '      }'
  echo '    }'
  echo '  }'
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── Main ────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BLUE}🔧 Forgewright MCP Generator${NC}"
  echo ""

  check_prerequisites
  read_project_vars
  generate_server
  install_deps
  print_summary
}

main "$@"
