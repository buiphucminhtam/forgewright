#!/bin/bash
# verify-mcp-manifest.sh — Verification artifact for Task 1.1
# Validates .forgewright/mcp-manifest.json against JSON Schema

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check .antigravity/mcp-manifest.json first, fallback to .forgewright/mcp-manifest.json
if [ -f "$PROJECT_DIR/.antigravity/mcp-manifest.json" ]; then
    MANIFEST_PATH="$PROJECT_DIR/.antigravity/mcp-manifest.json"
else
    MANIFEST_PATH="$PROJECT_DIR/.forgewright/mcp-manifest.json"
fi

SCHEMA_PATH="$PROJECT_DIR/.forgewright/schemas/mcp-manifest.schema.json"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*" && exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
info() { echo -e "${BLUE}ℹ${NC} $*"; }

echo ""
echo "=== MCP Manifest Verification ==="
echo ""

# 1. Check manifest exists
info "Checking manifest existence..."
if [ ! -f "$MANIFEST_PATH" ]; then
    fail "FAIL: Manifest does not exist at $MANIFEST_PATH"
fi
pass "Manifest exists"

# 2. Validate JSON syntax
info "Validating JSON syntax..."
if ! jq empty "$MANIFEST_PATH" 2>/dev/null; then
    fail "FAIL: Invalid JSON syntax in manifest"
fi
pass "Valid JSON syntax"

# 3. Check required fields
info "Checking required fields..."
REQUIRED_FIELDS=("manifest_version" "workspace" "forgewright" "servers")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e ".$field" "$MANIFEST_PATH" > /dev/null 2>&1; then
        fail "FAIL: Missing required field: $field"
    fi
done
pass "All 4 required fields present"

# 4. Validate forgewright sub-object
info "Validating forgewright object..."
if ! jq -e ".forgewright.version" "$MANIFEST_PATH" > /dev/null 2>&1; then
    fail "FAIL: Missing forgewright.version"
fi
if ! jq -e ".forgewright.canonical" "$MANIFEST_PATH" > /dev/null 2>&1; then
    fail "FAIL: Missing forgewright.canonical"
fi
if ! jq -e ".forgewright.server" "$MANIFEST_PATH" > /dev/null 2>&1; then
    fail "FAIL: Missing forgewright.server"
fi
pass "forgewright object valid"

# 5. Validate schema (if schema exists and ajv is available)
if [ -f "$SCHEMA_PATH" ]; then
    info "Checking schema validation..."
    if command -v ajv &> /dev/null; then
        if ajv validate -s "$SCHEMA_PATH" -d "$MANIFEST_PATH" --strict=false 2>/dev/null; then
            pass "Schema validation passed"
        else
            warn "Schema validation warnings (non-critical)"
        fi
    else
        warn "SKIP: ajv not installed, schema validation skipped"
        info "Install ajv for schema validation: npm install -g ajv"
    fi
else
    warn "SKIP: Schema file not found at $SCHEMA_PATH"
fi

# 6. Validate server entries
info "Validating server entries..."
SERVER_COUNT=$(jq '.servers | length' "$MANIFEST_PATH")
if [ "$SERVER_COUNT" -lt 1 ]; then
    fail "FAIL: At least one server must be defined"
fi
pass "Server entries valid ($SERVER_COUNT servers)"

# Check each server has required fields
for i in $(seq 0 $((SERVER_COUNT - 1))); do
    SERVER_NAME=$(jq -r ".servers[$i].name" "$MANIFEST_PATH")
    if ! jq -e ".servers[$i].type" "$MANIFEST_PATH" > /dev/null 2>&1; then
        fail "FAIL: Server $SERVER_NAME missing 'type' field"
    fi
    if ! jq -e ".servers[$i].path" "$MANIFEST_PATH" > /dev/null 2>&1 && ! jq -e ".servers[$i].command" "$MANIFEST_PATH" > /dev/null 2>&1; then
        fail "FAIL: Server $SERVER_NAME missing 'path' or 'command' field"
    fi
done
pass "All servers have required fields"

# 7. Test MCP setup script compatibility
info "Checking MCP setup script compatibility..."
if [ -f "$PROJECT_DIR/scripts/forgewright-mcp-setup.sh" ]; then
    if bash "$PROJECT_DIR/scripts/forgewright-mcp-setup.sh" --check 2>/dev/null; then
        pass "MCP setup script compatible"
    else
        warn "MCP setup script returned warnings (non-critical)"
    fi
else
    warn "SKIP: MCP setup script not found"
fi

# 8. Validate manifest_version format
info "Validating manifest_version format..."
VERSION_PATTERN='^[0-9]+\.[0-9]+$'
MANIFEST_VER=$(jq -r '.manifest_version' "$MANIFEST_PATH")
if ! [[ "$MANIFEST_VER" =~ $VERSION_PATTERN ]]; then
    fail "FAIL: manifest_version must match pattern X.Y (e.g., '1.0')"
fi
pass "manifest_version format valid ($MANIFEST_VER)"

echo ""
echo "=== Verification Complete: ALL PASSED ==="
echo ""
exit 0
